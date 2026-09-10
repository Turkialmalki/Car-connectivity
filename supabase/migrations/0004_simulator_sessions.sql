-- 0004 — Simulator sessions.
--
-- A simulator does not act as a user. It authenticates with a bearer secret
-- issued for ONE vehicle and a short window, and every simulator endpoint
-- derives the vehicle from the session rather than from the request body.
--
-- The secret itself is never stored: only its SHA-256 digest, so a database
-- disclosure does not hand anyone control of a vehicle.

create table if not exists public.simulator_sessions (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references public.vehicles(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  token_hash    text not null unique check (char_length(token_hash) = 64),
  label         text not null default 'Browser simulator',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_reason text,
  constraint simulator_sessions_window check (expires_at > created_at)
);

-- "Only one simulator may actively control a vehicle at a time", enforced by
-- the database rather than by handler discipline.
create unique index if not exists simulator_sessions_one_active_per_vehicle
  on public.simulator_sessions (vehicle_id)
  where revoked_at is null;

create index if not exists simulator_sessions_user_idx on public.simulator_sessions (user_id);

alter table public.simulator_sessions enable row level security;

revoke all on public.simulator_sessions from anon, authenticated;
grant select on public.simulator_sessions to authenticated;

-- A user may see sessions on vehicles they are a member of (so the console can
-- show "another simulator is attached"), but the token hash column is never
-- selected by client code and writing is server-only.
create policy simulator_sessions_select_members on public.simulator_sessions
  for select to authenticated
  using (public.is_vehicle_member(vehicle_id));

/** Opens a session, displacing any session currently attached to the vehicle. */
create or replace function public.open_simulator_session(
  p_vehicle_id  uuid,
  p_user_id     uuid,
  p_token_hash  text,
  p_ttl_seconds integer,
  p_label       text
)
returns public.simulator_sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.simulator_sessions;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 7200 then
    raise exception 'TTL' using errcode = 'P0004';
  end if;

  update public.simulator_sessions
     set revoked_at = now(), revoked_reason = 'displaced_by_new_session'
   where vehicle_id = p_vehicle_id and revoked_at is null;

  insert into public.simulator_sessions (vehicle_id, user_id, token_hash, expires_at, label)
  values (p_vehicle_id, p_user_id, p_token_hash,
          now() + make_interval(secs => p_ttl_seconds),
          coalesce(nullif(p_label, ''), 'Browser simulator'))
  returning * into v_row;

  return v_row;
end;
$$;

/** Resolves a bearer digest to a live session, or nothing. */
create or replace function public.authenticate_simulator(p_token_hash text)
returns public.simulator_sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.simulator_sessions;
begin
  update public.simulator_sessions
     set last_seen_at = now()
   where token_hash = p_token_hash
     and revoked_at is null
     and expires_at > now()
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.close_simulator_session(p_session_id uuid, p_user_id uuid)
returns public.simulator_sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.simulator_sessions;
begin
  update public.simulator_sessions
     set revoked_at = now(), revoked_reason = 'closed_by_user'
   where id = p_session_id and user_id = p_user_id and revoked_at is null
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.open_simulator_session(uuid, uuid, text, integer, text) from anon, authenticated;
revoke all on function public.authenticate_simulator(text) from anon, authenticated;
revoke all on function public.close_simulator_session(uuid, uuid) from anon, authenticated;
