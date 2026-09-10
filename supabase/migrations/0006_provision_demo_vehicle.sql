-- 0006 — First-run provisioning.
--
-- A signed-in account with no vehicle has nothing to look at, so the first API
-- call provisions one simulated vehicle and makes the caller its owner. This is
-- the replacement for the prototype's local "pair a VIN" fixture; it is a
-- server-only function, so a user still cannot mint themselves membership of
-- somebody else's vehicle.

create or replace function public.provision_demo_vehicle(p_user_id uuid)
returns public.vehicles
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_vehicle public.vehicles;
  v_vin     text;
begin
  select v.* into v_vehicle
    from public.vehicles v
    join public.vehicle_members m on m.vehicle_id = v.id
   where m.user_id = p_user_id and m.role = 'owner'
   order by v.created_at
   limit 1;

  if found then
    return v_vehicle;
  end if;

  -- Synthetic VIN. Deterministic per user so re-running is idempotent, and
  -- clearly not a real manufacturer sequence.
  v_vin := 'SIM' || upper(substr(replace(p_user_id::text, '-', ''), 1, 14));

  insert into public.vehicles (
    name, model, trim, model_year, vin, color_name, paint_hex, software_version,
    battery_capacity_kwh, max_range_km, max_ac_charge_kw, max_dc_charge_kw, capabilities
  ) values (
    'My vehicle', 'Crossover', 'Long Range', 2026, v_vin, 'Graphite', '#2E3439', '4.8.2',
    82.0, 512, 11, 190,
    jsonb_build_object(
      'remoteLock', true, 'remoteClimate', true, 'remoteTrunk', true, 'remoteFrunk', true,
      'remoteDoors', true, 'remoteChargePort', true, 'remoteDriveAuthorization', true,
      'remoteHorn', true, 'remoteLights', true, 'chargeControl', true, 'chargeScheduling', true,
      'digitalKey', 'uwb_ble_nfc', 'location', true, 'otaUpdates', true
    )
  )
  returning * into v_vehicle;

  insert into public.vehicle_members (vehicle_id, user_id, role, can_command, can_simulate)
  values (v_vehicle.id, p_user_id, 'owner', true, true);

  -- Parked in Riyadh, locked, asleep — the state a car is actually in when you
  -- open the app, rather than a demo pose.
  perform public.ingest_vehicle_state(
    v_vehicle.id,
    now(),
    jsonb_build_object(
      'connectivity', 'online',
      'lock', 'locked',
      'gear', 'P',
      'isMoving', false,
      'speedKph', 0,
      'doors', jsonb_build_object('frontLeft','closed','frontRight','closed','rearLeft','closed','rearRight','closed'),
      'trunk', 'closed',
      'frunk', 'closed',
      'windowsClosed', true,
      'power', 'asleep',
      'lights', jsonb_build_object('headlights', false, 'taillights', false, 'indicators', false, 'daytimeRunning', false),
      'driveAuthorization', jsonb_build_object('granted', false, 'expiresAt', null, 'grantedAt', null),
      'driveReady', false,
      'transientEvents', '[]'::jsonb,
      'climate', jsonb_build_object(
        'active', false, 'interiorTempC', 38.5, 'exteriorTempC', 41.0, 'targetTempC', 22,
        'passengerTargetTempC', 22, 'zonesSynced', true, 'fanLevel', 2,
        'driverSeatHeat', 0, 'passengerSeatHeat', 0, 'seatVentilation', 0,
        'steeringWheelHeat', false, 'frontDefrost', false, 'rearDefrost', false,
        'departureTime', null, 'departureEnabled', false),
      'charge', jsonb_build_object(
        'batteryPercent', 72, 'estimatedRangeKm', 368, 'status', 'not_plugged_in',
        'chargeLimitPercent', 80, 'powerKw', 0, 'addedRangeKm', 0, 'minutesRemaining', null,
        'portOpen', false, 'locationLabel', 'Home', 'scheduleEnabled', false,
        'scheduleStart', '23:00', 'scheduleEnd', '06:00', 'batteryHealthPercent', 98),
      'location', jsonb_build_object(
        'latitude', 24.7136, 'longitude', 46.6753, 'headingDegrees', 45,
        'isLive', true, 'capturedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'addressLabel', 'King Fahd Road', 'city', 'Riyadh')
    )
  );

  return v_vehicle;
end;
$$;

revoke all on function public.provision_demo_vehicle(uuid) from anon, authenticated;
