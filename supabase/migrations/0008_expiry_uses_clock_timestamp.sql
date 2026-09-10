-- 0008 — Evaluate expiry against the wall clock.
--
-- `now()` is the transaction's start time and does not advance while the
-- transaction runs. For a command window measured in tens of seconds, a claim
-- inside a long-running transaction could accept a command that had in fact
-- already expired. `clock_timestamp()` is what a command window is actually
-- measured against.
--
-- Found by testing: an expired command was claimed successfully when the claim
-- ran in the same transaction as the request.

create or replace function public.expire_stale_commands(p_vehicle_id uuid default null)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  update public.vehicle_commands
     set status = 'expired',
         completed_at = clock_timestamp(),
         failure_code = 'command_expired',
         failure_reason = 'The command window closed before the vehicle started executing it.'
   where status = 'queued'
     and expires_at <= clock_timestamp()
     and (p_vehicle_id is null or vehicle_id = p_vehicle_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.claim_next_command(p_vehicle_id uuid, p_session_id uuid)
returns public.vehicle_commands
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.vehicle_commands;
begin
  perform public.expire_stale_commands(p_vehicle_id);

  update public.vehicle_commands c
     set status = 'executing', claimed_at = clock_timestamp(), claimed_by = p_session_id
   where c.id = (
     select id from public.vehicle_commands
      where vehicle_id = p_vehicle_id
        and status = 'queued'
        and expires_at > clock_timestamp()
      order by requested_at
      for update skip locked
      limit 1
   )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.authenticate_simulator(p_token_hash text)
returns public.simulator_sessions
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.simulator_sessions;
begin
  update public.simulator_sessions
     set last_seen_at = clock_timestamp()
   where token_hash = p_token_hash
     and revoked_at is null
     and expires_at > clock_timestamp()
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.expire_stale_commands(uuid) from public;
revoke execute on function public.claim_next_command(uuid, uuid) from public;
revoke execute on function public.authenticate_simulator(text) from public;
grant execute on function public.expire_stale_commands(uuid) to service_role;
grant execute on function public.claim_next_command(uuid, uuid) to service_role;
grant execute on function public.authenticate_simulator(text) to service_role;
