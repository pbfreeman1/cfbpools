-- Admin-only Survivor entry deletion.
--
-- Problem: survivor_entries -> survivor_picks / survivor_bonus_picks are
-- ON DELETE CASCADE, but both child tables carry BEFORE DELETE guards
-- (validate_survivor_pick_delete / validate_survivor_bonus_pick_delete)
-- that RAISE once any of the pick's games have kicked off. Those guards
-- exist to stop a normal user clearing a locked pick, and must stay in
-- force for every normal app path. Their side effect is that once Week 1
-- has been played, an admin can no longer delete ANY entry from
-- /admin/survivor/entries -- the cascade trips the guard and the whole
-- transaction rolls back.
--
-- Fix: a dedicated SECURITY DEFINER function that only an admin can call,
-- which sets a transaction-local flag the two delete guards check and
-- skip for that one path. The per-pick delete path used elsewhere in the
-- app is untouched and still blocked by the guard as today.

-- 1. Teach the two BEFORE DELETE guards to honour the scoped bypass flag.
--    Nothing else in these bodies changes.

create or replace function public.validate_survivor_pick_delete()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_earliest_kickoff timestamptz;
begin
  -- Scoped, transaction-local bypass set only by admin_delete_survivor_entry().
  if coalesce(current_setting('app.bypass_survivor_locks', true), '') = 'on' then
    return OLD;
  end if;

  if OLD.is_bonus_week then
    raise exception 'This is a bonus week pick and must be cleared from the bonus pick screen, not as a regular pick';
  end if;

  select min(g.kickoff_time) into v_earliest_kickoff
  from public.games g
  where g.schedule_id = OLD.schedule_id
    and (
      g.home_team_id = OLD.team_id
      or g.away_team_id = OLD.team_id
    );

  if v_earliest_kickoff is not null and now() >= v_earliest_kickoff then
    raise exception 'This week''s pick is already locked and cannot be cleared';
  end if;

  return OLD;
end;
$function$;

create or replace function public.validate_survivor_bonus_pick_delete()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_earliest_kickoff timestamptz;
begin
  -- Scoped, transaction-local bypass set only by admin_delete_survivor_entry().
  if coalesce(current_setting('app.bypass_survivor_locks', true), '') = 'on' then
    return OLD;
  end if;

  select min(g.kickoff_time) into v_earliest_kickoff
  from public.games g
  where g.schedule_id = OLD.schedule_id
    and (
      g.home_team_id in (OLD.team_a_id, OLD.team_b_id)
      or g.away_team_id in (OLD.team_a_id, OLD.team_b_id)
    );

  if v_earliest_kickoff is not null and now() >= v_earliest_kickoff then
    raise exception 'This week''s bonus pick is already locked and cannot be cleared';
  end if;

  return OLD;
end;
$function$;

-- 2. The admin-only destructor.

create or replace function public.admin_delete_survivor_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Not authorized to delete survivor entries' using errcode = '42501';
  end if;

  if not exists (select 1 from public.survivor_entries where id = p_entry_id) then
    raise exception 'Survivor entry % not found', p_entry_id;
  end if;

  -- Transaction-local: auto-resets when this RPC's transaction ends. Only
  -- the two BEFORE DELETE lock guards look at it.
  perform set_config('app.bypass_survivor_locks', 'on', true);

  -- Audit line -- shows up in Postgres logs with the acting admin's uid.
  -- (app/actions/admin-survivor.ts also writes a full row snapshot into
  --  admin_actions before calling this.)
  raise log 'admin_delete_survivor_entry: admin % deleting survivor entry %', v_admin, p_entry_id;

  -- Children before parent; picks before bonus rows so the
  -- unsync_survivor_bonus_pick_from_picks AFTER DELETE trigger finds no
  -- surviving survivor_picks row to UPDATE. The *_log delete triggers
  -- still fire, so pick history survives in survivor_picks_log /
  -- survivor_bonus_picks_log.
  delete from public.survivor_picks where entry_id = p_entry_id;
  delete from public.survivor_bonus_picks where entry_id = p_entry_id;
  delete from public.survivor_entries where id = p_entry_id;
end;
$function$;

revoke all on function public.admin_delete_survivor_entry(uuid) from public;
grant execute on function public.admin_delete_survivor_entry(uuid) to authenticated;
