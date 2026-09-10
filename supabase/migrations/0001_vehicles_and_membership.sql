-- 0001 — Vehicles and membership.
--
-- `vehicles` is the fleet registry. `vehicle_members` is the ONLY source of
-- authorization: every other policy in this schema is expressed in terms of it.
-- Clients may read their own membership but may never write it, so a user
-- cannot grant themselves access to a vehicle, promote themselves to owner, or
-- hand themselves simulator rights.

create extension if not exists pgcrypto;

create table if not exists public.vehicles (
  id                     uuid primary key default gen_random_uuid(),
  name                   text        not null,
  model                  text        not null,
  trim                   text        not null default '',
  model_year             int         not null check (model_year between 1990 and 2100),
  vin                    text        not null unique check (char_length(vin) between 11 and 17),
  color_name             text        not null default 'Unspecified',
  paint_hex              text        not null default '#B8C2CC' check (paint_hex ~ '^#[0-9A-Fa-f]{6}$'),
  software_version       text        not null default '1.0.0',
  capabilities           jsonb       not null default '{}'::jsonb,
  battery_capacity_kwh   numeric(6,2) not null check (battery_capacity_kwh > 0),
  max_range_km           int         not null check (max_range_km > 0),
  max_ac_charge_kw       numeric(6,2) not null default 11,
  max_dc_charge_kw       numeric(6,2) not null default 150,
  -- Every vehicle in this system is simulated. The flag is explicit so the UI
  -- can never accidentally present a simulation as a physical car.
  is_simulated           boolean     not null default true,
  created_at             timestamptz not null default now()
);

-- The last four characters are all the app is ever allowed to display.
create or replace function public.vin_masked(p_vin text)
returns text language sql immutable as $$
  select repeat('•', greatest(char_length(p_vin) - 4, 0)) || right(p_vin, 4);
$$;

create type public.vehicle_role as enum ('owner', 'driver', 'viewer');

create table if not exists public.vehicle_members (
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.vehicle_role not null default 'driver',
  -- Split from `role` deliberately: an owner may want a driver who can open the
  -- car but may not attach a simulator to it.
  can_command  boolean not null default true,
  can_simulate boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (vehicle_id, user_id)
);

create index if not exists vehicle_members_user_idx on public.vehicle_members (user_id);

-- SECURITY DEFINER so that policies ON vehicle_members can call it without
-- recursing through vehicle_members' own RLS.
create or replace function public.is_vehicle_member(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.vehicle_members m
    where m.vehicle_id = p_vehicle_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_command_vehicle(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.vehicle_members m
    where m.vehicle_id = p_vehicle_id
      and m.user_id = auth.uid()
      and m.can_command
      and m.role in ('owner', 'driver')
  );
$$;

create or replace function public.can_simulate_vehicle(p_vehicle_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.vehicle_members m
    where m.vehicle_id = p_vehicle_id
      and m.user_id = auth.uid()
      and m.can_simulate
      and m.role in ('owner', 'driver')
  );
$$;

alter table public.vehicles        enable row level security;
alter table public.vehicle_members enable row level security;

-- Read-only for clients. Every write path goes through a server handler holding
-- the secret key, which authorizes explicitly before it writes.
revoke all on public.vehicles        from anon, authenticated;
revoke all on public.vehicle_members from anon, authenticated;
grant select on public.vehicles        to authenticated;
grant select on public.vehicle_members to authenticated;

create policy vehicles_select_members on public.vehicles
  for select to authenticated
  using (public.is_vehicle_member(id));

create policy vehicle_members_select_self on public.vehicle_members
  for select to authenticated
  using (user_id = auth.uid());
