-- 0007 — Close the SECURITY DEFINER functions to clients.
--
-- Postgres grants EXECUTE on every new function to PUBLIC. Revoking from
-- `authenticated` alone leaves that grant in place, so the REVOKEs in the
-- earlier migrations did nothing: any signed-in client could call
-- ingest_vehicle_state over PostgREST and forge a vehicle report. These
-- functions run as the definer and bypass RLS by design, so PUBLIC must lose
-- EXECUTE and only the secret-key role may call them.
--
-- The read-only predicates used inside RLS policies are the exception: a policy
-- is evaluated as the role running the query, so `authenticated` must be able
-- to call them.

revoke execute on function public.ingest_vehicle_state(uuid, timestamptz, jsonb) from public;
revoke execute on function public.request_command(uuid, uuid, text, jsonb, text, text, text, timestamptz) from public;
revoke execute on function public.claim_next_command(uuid, uuid) from public;
revoke execute on function public.apply_command_result(uuid, uuid, uuid, public.command_status, text, text, jsonb, timestamptz, jsonb) from public;
revoke execute on function public.expire_stale_commands(uuid) from public;
revoke execute on function public.open_simulator_session(uuid, uuid, text, integer, text) from public;
revoke execute on function public.authenticate_simulator(text) from public;
revoke execute on function public.close_simulator_session(uuid, uuid) from public;
revoke execute on function public.provision_demo_vehicle(uuid) from public;

grant execute on function public.ingest_vehicle_state(uuid, timestamptz, jsonb) to service_role;
grant execute on function public.request_command(uuid, uuid, text, jsonb, text, text, text, timestamptz) to service_role;
grant execute on function public.claim_next_command(uuid, uuid) to service_role;
grant execute on function public.apply_command_result(uuid, uuid, uuid, public.command_status, text, text, jsonb, timestamptz, jsonb) to service_role;
grant execute on function public.expire_stale_commands(uuid) to service_role;
grant execute on function public.open_simulator_session(uuid, uuid, text, integer, text) to service_role;
grant execute on function public.authenticate_simulator(text) to service_role;
grant execute on function public.close_simulator_session(uuid, uuid) to service_role;
grant execute on function public.provision_demo_vehicle(uuid) to service_role;

grant execute on function public.is_vehicle_member(uuid) to authenticated;
grant execute on function public.can_command_vehicle(uuid) to authenticated;
grant execute on function public.can_simulate_vehicle(uuid) to authenticated;
grant execute on function public.can_join_vehicle_topic(text) to authenticated;

-- Anything added later inherits this default rather than PUBLIC's.
alter default privileges in schema public revoke execute on functions from public;
