-- 0003 — Commands.
--
-- A command is a *request*. It is accepted with 202 and lives here until the
-- simulator claims it, executes it and reports a result. Nothing a client can
-- do writes a result: clients hold SELECT on this table and nothing else.

create type public.command_status as enum (
  'queued',      -- accepted, waiting for the vehicle to pick it up
  'executing',   -- claimed by exactly one simulator session
  'succeeded',   -- the vehicle acknowledged doing it
  'failed',      -- the vehicle refused or could not do it
  'expired',     -- its window closed before execution started
  'rejected'     -- refused before dispatch (capability/precondition)
);

create table if not exists public.vehicle_commands (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid not null references public.vehicles(id) on delete cascade,
  requested_by      uuid not null references auth.users(id) on delete cascade,
  type              text not null check (char_length(type) between 2 and 40),
  payload           jsonb not null default '{}'::jsonb,
  idempotency_key   text not null check (char_length(idempotency_key) between 8 and 128),
  -- Digest of (type, payload). Reusing a key with a different body is a client
  -- bug and is refused rather than silently returning the wrong command.
  request_digest    text not null,
  correlation_id    text not null,
  status            public.command_status not null default 'queued',
  requested_at      timestamptz not null default now(),
  expires_at        timestamptz not null,
  claimed_at        timestamptz,
  claimed_by        uuid,
  completed_at      timestamptz,
  failure_code      text,
  failure_reason    text,
  -- What the simulator reported back, kept for the trace view.
  result            jsonb,
  constraint vehicle_commands_expiry_after_request check (expires_at > requested_at),
  constraint vehicle_commands_idempotent unique (vehicle_id, idempotency_key)
);

create index if not exists vehicle_commands_vehicle_requested_idx
  on public.vehicle_commands (vehicle_id, requested_at desc);
-- Supports the claim query: the queue of one vehicle, oldest first.
create index if not exists vehicle_commands_queue_idx
  on public.vehicle_commands (vehicle_id, requested_at)
  where status = 'queued';

alter table public.vehicle_commands enable row level security;

revoke all on public.vehicle_commands from anon, authenticated;
grant select on public.vehicle_commands to authenticated;

create policy vehicle_commands_select_members on public.vehicle_commands
  for select to authenticated
  using (public.is_vehicle_member(vehicle_id));

/**
 * Marks every command whose window has closed without execution.
 *
 * Only `queued` commands expire. Once a simulator has claimed one, the outcome
 * is the vehicle's to report — turning an in-flight command into "expired"
 * here would be the server inventing an outcome it does not know.
 */
create or replace function public.expire_stale_commands(p_vehicle_id uuid default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  update public.vehicle_commands
     set status = 'expired',
         completed_at = now(),
         failure_code = 'command_expired',
         failure_reason = 'The command window closed before the vehicle started executing it.'
   where status = 'queued'
     and expires_at <= now()
     and (p_vehicle_id is null or vehicle_id = p_vehicle_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/**
 * Accepts a command request, or returns the existing one for the same
 * idempotency key.
 *
 * The second return column says which happened, so the handler can answer a
 * retry with the original command instead of queueing a second unlock.
 */
create or replace function public.request_command(
  p_vehicle_id      uuid,
  p_user_id         uuid,
  p_type            text,
  p_payload         jsonb,
  p_idempotency_key text,
  p_request_digest  text,
  p_correlation_id  text,
  p_expires_at      timestamptz
)
returns table (command public.vehicle_commands, replayed boolean, digest_conflict boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existing public.vehicle_commands;
  v_new      public.vehicle_commands;
begin
  select * into v_existing
    from public.vehicle_commands
   where vehicle_id = p_vehicle_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_digest is distinct from p_request_digest then
      return query select v_existing, false, true;
    end if;
    return query select v_existing, true, false;
  end if;

  insert into public.vehicle_commands (
    vehicle_id, requested_by, type, payload, idempotency_key,
    request_digest, correlation_id, expires_at
  ) values (
    p_vehicle_id, p_user_id, p_type, coalesce(p_payload, '{}'::jsonb), p_idempotency_key,
    p_request_digest, p_correlation_id, p_expires_at
  )
  returning * into v_new;

  return query select v_new, false, false;
exception
  -- Two identical requests racing: the loser reads the winner's row.
  when unique_violation then
    select * into v_existing
      from public.vehicle_commands
     where vehicle_id = p_vehicle_id and idempotency_key = p_idempotency_key;
    return query select v_existing,
                        v_existing.request_digest is not distinct from p_request_digest,
                        v_existing.request_digest is distinct from p_request_digest;
end;
$$;

/**
 * Atomically hands the next eligible command to exactly one simulator session.
 *
 * FOR UPDATE SKIP LOCKED is what makes "exactly one" true: two simulators
 * claiming at the same instant take different rows, never the same one twice.
 * Expiry is settled first, so a command whose window has already closed can
 * never be picked up.
 */
create or replace function public.claim_next_command(p_vehicle_id uuid, p_session_id uuid)
returns public.vehicle_commands
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.vehicle_commands;
begin
  perform public.expire_stale_commands(p_vehicle_id);

  update public.vehicle_commands c
     set status = 'executing', claimed_at = now(), claimed_by = p_session_id
   where c.id = (
     select id from public.vehicle_commands
      where vehicle_id = p_vehicle_id
        and status = 'queued'
        and expires_at > now()
      order by requested_at
      for update skip locked
      limit 1
   )
  returning * into v_row;

  return v_row;
end;
$$;

/**
 * Records an execution result and the state it produced, in one transaction.
 *
 * Rejects a result for a command this session does not own, and refuses to
 * re-complete a command that already reached a terminal status — a duplicated
 * result delivery must not overwrite the first one.
 *
 * Errors are raised with codes the API layer maps to HTTP:
 *   NOTOWN — not this session's command · DONE — already terminal
 */
create or replace function public.apply_command_result(
  p_command_id     uuid,
  p_vehicle_id     uuid,
  p_session_id     uuid,
  p_status         public.command_status,
  p_failure_code   text,
  p_failure_reason text,
  p_result         jsonb,
  p_observed_at    timestamptz,
  p_reported       jsonb
)
returns public.vehicle_commands
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.vehicle_commands;
begin
  select * into v_row
    from public.vehicle_commands
   where id = p_command_id
   for update;

  if not found or v_row.vehicle_id <> p_vehicle_id or v_row.claimed_by is distinct from p_session_id then
    raise exception 'NOTOWN' using errcode = 'P0002';
  end if;

  if v_row.status in ('succeeded', 'failed', 'expired', 'rejected') then
    raise exception 'DONE' using errcode = 'P0003';
  end if;

  update public.vehicle_commands
     set status = p_status,
         completed_at = now(),
         failure_code = p_failure_code,
         failure_reason = p_failure_reason,
         result = p_result
   where id = p_command_id
  returning * into v_row;

  -- The state the command produced lands with the same commit as the result,
  -- so a client can never read "unlocked confirmed" against a locked snapshot.
  if p_reported is not null and p_observed_at is not null then
    perform public.ingest_vehicle_state(p_vehicle_id, p_observed_at, p_reported);
  end if;

  return v_row;
end;
$$;

revoke all on function public.expire_stale_commands(uuid) from anon, authenticated;
revoke all on function public.request_command(uuid, uuid, text, jsonb, text, text, text, timestamptz) from anon, authenticated;
revoke all on function public.claim_next_command(uuid, uuid) from anon, authenticated;
revoke all on function public.apply_command_result(uuid, uuid, uuid, public.command_status, text, text, jsonb, timestamptz, jsonb) from anon, authenticated;
