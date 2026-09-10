-- 0005 — Realtime delivery on private per-vehicle channels.
--
-- Channel name: vehicle:<vehicle-id>.
--
-- Two events are published, both from database triggers so that the message and
-- the committed row can never disagree:
--   state   — a new reported snapshot
--   command — a command's status changed
--
-- Authorization is RLS on realtime.messages. `authenticated` is granted SELECT
-- only, which is what a private channel checks before it lets a socket join, so
-- a member can listen and NOBODY can broadcast: there is no INSERT grant, and
-- therefore no way for a client to forge a vehicle-state event.

create or replace function public.broadcast_vehicle_state()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform realtime.broadcast_changes(
    'vehicle:' || new.vehicle_id::text,
    'state',
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    case when tg_op = 'UPDATE' then old else null end
  );
  return null;
end;
$$;

create or replace function public.broadcast_vehicle_command()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform realtime.broadcast_changes(
    'vehicle:' || new.vehicle_id::text,
    'command',
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    case when tg_op = 'UPDATE' then old else null end
  );
  return null;
end;
$$;

drop trigger if exists vehicle_state_broadcast on public.vehicle_state;
create trigger vehicle_state_broadcast
  after insert or update on public.vehicle_state
  for each row execute function public.broadcast_vehicle_state();

drop trigger if exists vehicle_commands_broadcast on public.vehicle_commands;
create trigger vehicle_commands_broadcast
  after insert or update on public.vehicle_commands
  for each row execute function public.broadcast_vehicle_command();

-- Channel authorization. `realtime.topic()` is the channel the socket asked to
-- join; anything that is not a well-formed vehicle topic is refused outright.
create or replace function public.can_join_vehicle_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_topic is null or p_topic !~ '^vehicle:[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  begin
    v_id := split_part(p_topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;
  return public.is_vehicle_member(v_id);
end;
$$;

grant execute on function public.can_join_vehicle_topic(text) to authenticated;

-- realtime.messages is owned by supabase_realtime_admin and already has RLS
-- enabled on a hosted project, so this migration only adds the policy. Adding a
-- policy to a table you do not own is permitted; ALTER TABLE on it is not.
drop policy if exists vehicle_channel_read on realtime.messages;
create policy vehicle_channel_read on realtime.messages
  for select to authenticated
  using (public.can_join_vehicle_topic(realtime.topic()));

-- Deliberately no INSERT policy: with RLS on and no INSERT policy, a client
-- socket cannot publish to a vehicle topic at all. Broadcasts originate only
-- from the SECURITY DEFINER triggers above.
