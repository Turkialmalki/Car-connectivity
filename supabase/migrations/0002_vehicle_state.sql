-- 0002 — Reported vehicle state.
--
-- Exactly one row per vehicle: this table is the current snapshot, not a log.
-- `revision` increases monotonically and is the only thing a client uses to
-- decide whether an arriving update is newer than what it already has.
--
-- `observed_at` is when the VEHICLE observed the state; `received_at` is when
-- the server accepted the report. Both are kept because a delayed packet has an
-- old observation time and a fresh receipt time, and it is the observation time
-- that decides whether it may overwrite anything.

create table if not exists public.vehicle_state (
  vehicle_id      uuid primary key references public.vehicles(id) on delete cascade,
  revision        bigint      not null default 1 check (revision > 0),
  reported        jsonb       not null,
  observed_at     timestamptz not null,
  received_at     timestamptz not null default now(),
  -- Denormalized projections of `reported`, for indexing and cheap filtering.
  connectivity    text        not null default 'online'
                    check (connectivity in ('online','asleep','poor_signal','offline','service_mode')),
  lock_state      text        not null default 'locked' check (lock_state in ('locked','unlocked')),
  power_state     text        not null default 'asleep' check (power_state in ('asleep','waking','awake')),
  battery_percent numeric(5,2) not null default 0 check (battery_percent between 0 and 100),
  speed_kph       numeric(6,2) not null default 0 check (speed_kph >= 0 and speed_kph <= 400),
  latitude        double precision check (latitude between -90 and 90),
  longitude       double precision check (longitude between -180 and 180),
  heading_degrees numeric(6,2) check (heading_degrees >= 0 and heading_degrees < 360)
);

create index if not exists vehicle_state_observed_idx on public.vehicle_state (observed_at desc);

alter table public.vehicle_state enable row level security;

-- No client may write reported state under any circumstances. Reports arrive
-- only through POST /api/simulator/telemetry, which authenticates a simulator
-- session bound to one vehicle and then calls ingest_vehicle_state() with the
-- secret key.
revoke all on public.vehicle_state from anon, authenticated;
grant select on public.vehicle_state to authenticated;

create policy vehicle_state_select_members on public.vehicle_state
  for select to authenticated
  using (public.is_vehicle_member(vehicle_id));

/**
 * Accepts a telemetry report, rejecting anything that is not strictly newer
 * than what is already stored.
 *
 * Returns the resulting row on acceptance and NOTHING on rejection, so a caller
 * that gets no row knows the report was stale and can say so with a 409 rather
 * than silently pretending it was applied.
 */
create or replace function public.ingest_vehicle_state(
  p_vehicle_id  uuid,
  p_observed_at timestamptz,
  p_reported    jsonb
)
returns public.vehicle_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.vehicle_state;
begin
  insert into public.vehicle_state as vs (
    vehicle_id, revision, reported, observed_at, received_at,
    connectivity, lock_state, power_state, battery_percent, speed_kph,
    latitude, longitude, heading_degrees
  )
  values (
    p_vehicle_id, 1, p_reported, p_observed_at, now(),
    coalesce(p_reported->>'connectivity', 'online'),
    coalesce(p_reported->>'lock', 'locked'),
    coalesce(p_reported->>'power', 'asleep'),
    coalesce((p_reported#>>'{charge,batteryPercent}')::numeric, 0),
    coalesce((p_reported->>'speedKph')::numeric, 0),
    (p_reported#>>'{location,latitude}')::double precision,
    (p_reported#>>'{location,longitude}')::double precision,
    coalesce((p_reported#>>'{location,headingDegrees}')::numeric, 0)
  )
  on conflict (vehicle_id) do update set
    -- The staleness guard. A report observed at or before the stored
    -- observation time changes nothing.
    revision        = vs.revision + 1,
    reported        = excluded.reported,
    observed_at     = excluded.observed_at,
    received_at     = now(),
    connectivity    = excluded.connectivity,
    lock_state      = excluded.lock_state,
    power_state     = excluded.power_state,
    battery_percent = excluded.battery_percent,
    speed_kph       = excluded.speed_kph,
    latitude        = excluded.latitude,
    longitude       = excluded.longitude,
    heading_degrees = excluded.heading_degrees
  where excluded.observed_at > vs.observed_at
  returning * into v_row;

  return v_row;  -- NULL row when the WHERE clause rejected a stale report.
end;
$$;

revoke all on function public.ingest_vehicle_state(uuid, timestamptz, jsonb) from anon, authenticated;
