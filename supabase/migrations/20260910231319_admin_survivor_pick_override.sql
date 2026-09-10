-- Extend the existing app.bypass_survivor_locks pattern (already used by
-- admin_delete_survivor_entry / validate_survivor_pick_delete /
-- validate_survivor_bonus_pick_delete) to the INSERT/UPDATE validation
-- triggers, and add admin RPCs to set/clear a single week's pick or bonus
-- pick regardless of lock state or entry status.
--
-- Bypass affects only timing/state checks (kickoff already passed, entry
-- eliminated). It does NOT bypass: SEC-team eligibility, "team has a
-- scheduled game this week", season-long team-reuse, or the 2-bonus-week
-- cap -- those stay enforced even for admin edits.

create or replace function public.validate_survivor_pick()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_bypass boolean := coalesce(current_setting('app.bypass_survivor_locks', true), '') = 'on';
  v_game record;
  v_bonus_game record;
  v_conference text;
  v_bonus_conference text;
  v_old_earliest_kickoff timestamptz;
  v_reuse_count integer;
  v_bonus_weeks_used integer;
  v_entry_status text;
begin
  select status into v_entry_status from public.survivor_entries where id = NEW.entry_id;
  if v_entry_status = 'eliminated' and not v_bypass then
    raise exception 'This entry has been eliminated and can no longer submit picks';
  end if;

  if TG_OP = 'UPDATE' and not v_bypass then
    select min(g.kickoff_time) into v_old_earliest_kickoff
    from public.games g
    where g.schedule_id = OLD.schedule_id
      and (
        g.home_team_id in (OLD.team_id, OLD.bonus_team_id)
        or g.away_team_id in (OLD.team_id, OLD.bonus_team_id)
      );

    if v_old_earliest_kickoff is not null and now() >= v_old_earliest_kickoff then
      raise exception 'This week''s pick is already locked and cannot be changed';
    end if;
  end if;

  select conference into v_conference from public.master_teams where id = NEW.team_id;
  if v_conference is distinct from 'SEC' then
    raise exception 'Picked team must be an SEC team';
  end if;

  select g.kickoff_time into v_game
  from public.games g
  where g.schedule_id = NEW.schedule_id
    and (g.home_team_id = NEW.team_id or g.away_team_id = NEW.team_id)
  limit 1;

  if v_game.kickoff_time is null then
    raise exception 'That team has no scheduled game for this week';
  end if;
  if now() >= v_game.kickoff_time and not v_bypass then
    raise exception 'You cannot pick a team whose game has already kicked off';
  end if;

  if NEW.is_bonus_week then
    if NEW.bonus_team_id is null then
      raise exception 'A bonus week requires a second team';
    end if;

    select conference into v_bonus_conference from public.master_teams where id = NEW.bonus_team_id;
    if v_bonus_conference is distinct from 'SEC' then
      raise exception 'Bonus pick must be an SEC team';
    end if;

    select g.kickoff_time into v_bonus_game
    from public.games g
    where g.schedule_id = NEW.schedule_id
      and (g.home_team_id = NEW.bonus_team_id or g.away_team_id = NEW.bonus_team_id)
    limit 1;

    if v_bonus_game.kickoff_time is null then
      raise exception 'Bonus team has no scheduled game for this week';
    end if;
    if now() >= v_bonus_game.kickoff_time and not v_bypass then
      raise exception 'You cannot pick a bonus team whose game has already kicked off';
    end if;

    select count(*) into v_bonus_weeks_used
    from public.survivor_picks
    where entry_id = NEW.entry_id
      and is_bonus_week = true
      and id is distinct from NEW.id;

    if v_bonus_weeks_used >= 2 then
      raise exception 'This entry has already used both bonus picks for the season';
    end if;
  end if;

  select count(*) into v_reuse_count
  from public.survivor_picks sp
  where sp.entry_id = NEW.entry_id
    and sp.schedule_id is distinct from NEW.schedule_id
    and (
      sp.team_id in (NEW.team_id, coalesce(NEW.bonus_team_id, NEW.team_id))
      or sp.bonus_team_id in (NEW.team_id, coalesce(NEW.bonus_team_id, NEW.team_id))
    );

  if v_reuse_count > 0 then
    raise exception 'This entry has already used that team earlier in the season';
  end if;

  return NEW;
end;
$function$;

create or replace function public.validate_survivor_bonus_pick()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_bypass boolean := coalesce(current_setting('app.bypass_survivor_locks', true), '') = 'on';
  v_entry_status text;
  v_old_earliest_kickoff timestamptz;
  v_game_a record;
  v_game_b record;
  v_conf_a text;
  v_conf_b text;
  v_weeks_used integer;
  v_reuse_count integer;
begin
  select status into v_entry_status from public.survivor_entries where id = NEW.entry_id;
  if v_entry_status = 'eliminated' and not v_bypass then
    raise exception 'This entry has been eliminated and can no longer submit picks';
  end if;

  if NEW.team_a_id = NEW.team_b_id then
    raise exception 'Bonus pick requires two different teams';
  end if;

  if TG_OP = 'UPDATE' and not v_bypass then
    select min(g.kickoff_time) into v_old_earliest_kickoff
    from public.games g
    where g.schedule_id = OLD.schedule_id
      and (
        g.home_team_id in (OLD.team_a_id, OLD.team_b_id)
        or g.away_team_id in (OLD.team_a_id, OLD.team_b_id)
      );

    if v_old_earliest_kickoff is not null and now() >= v_old_earliest_kickoff then
      raise exception 'This week''s bonus pick is already locked and cannot be changed';
    end if;
  end if;

  select conference into v_conf_a from public.master_teams where id = NEW.team_a_id;
  if v_conf_a is distinct from 'SEC' then
    raise exception 'Bonus picks must be SEC teams';
  end if;

  select conference into v_conf_b from public.master_teams where id = NEW.team_b_id;
  if v_conf_b is distinct from 'SEC' then
    raise exception 'Bonus picks must be SEC teams';
  end if;

  select g.kickoff_time into v_game_a
  from public.games g
  where g.schedule_id = NEW.schedule_id
    and (g.home_team_id = NEW.team_a_id or g.away_team_id = NEW.team_a_id)
  limit 1;
  if v_game_a.kickoff_time is null then
    raise exception 'That team has no scheduled game for this week';
  end if;
  if now() >= v_game_a.kickoff_time and not v_bypass then
    raise exception 'You cannot pick a team whose game has already kicked off';
  end if;

  select g.kickoff_time into v_game_b
  from public.games g
  where g.schedule_id = NEW.schedule_id
    and (g.home_team_id = NEW.team_b_id or g.away_team_id = NEW.team_b_id)
  limit 1;
  if v_game_b.kickoff_time is null then
    raise exception 'That team has no scheduled game for this week';
  end if;
  if now() >= v_game_b.kickoff_time and not v_bypass then
    raise exception 'You cannot pick a team whose game has already kicked off';
  end if;

  select count(*) into v_weeks_used
  from public.survivor_bonus_picks
  where entry_id = NEW.entry_id
    and id is distinct from NEW.id;
  if v_weeks_used >= 2 then
    raise exception 'This entry has already used both bonus picks for the season';
  end if;

  select count(*) into v_reuse_count
  from public.survivor_picks sp
  where sp.entry_id = NEW.entry_id
    and sp.schedule_id is distinct from NEW.schedule_id
    and (
      sp.team_id in (NEW.team_a_id, NEW.team_b_id)
      or sp.bonus_team_id in (NEW.team_a_id, NEW.team_b_id)
    );
  if v_reuse_count > 0 then
    raise exception 'This entry has already used that team earlier in the season';
  end if;

  select count(*) into v_reuse_count
  from public.survivor_bonus_picks bp
  where bp.entry_id = NEW.entry_id
    and bp.schedule_id is distinct from NEW.schedule_id
    and bp.id is distinct from NEW.id
    and (
      bp.team_a_id in (NEW.team_a_id, NEW.team_b_id)
      or bp.team_b_id in (NEW.team_a_id, NEW.team_b_id)
    );
  if v_reuse_count > 0 then
    raise exception 'This entry has already used that team earlier in the season';
  end if;

  return NEW;
end;
$function$;

-- Admin RPCs. Mirror admin_delete_survivor_entry: is_admin() check,
-- SECURITY DEFINER, transaction-local bypass flag, raise log audit line.
-- Application code should write a row to admin_actions before calling
-- these, same convention as the existing admin delete flow.

create or replace function public.admin_set_survivor_pick(
  p_entry_id uuid,
  p_schedule_id uuid,
  p_team_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Not authorized to edit survivor picks' using errcode = '42501';
  end if;

  if not exists (select 1 from public.survivor_entries where id = p_entry_id) then
    raise exception 'Survivor entry % not found', p_entry_id;
  end if;

  perform set_config('app.bypass_survivor_locks', 'on', true);

  raise log 'admin_set_survivor_pick: admin % setting pick for entry % week %', v_admin, p_entry_id, p_schedule_id;

  insert into public.survivor_picks (entry_id, schedule_id, team_id, is_bonus_week, bonus_team_id)
  values (p_entry_id, p_schedule_id, p_team_id, false, null)
  on conflict (entry_id, schedule_id)
  do update set team_id = excluded.team_id, is_bonus_week = false, bonus_team_id = null;
end;
$function$;

create or replace function public.admin_delete_survivor_pick(
  p_entry_id uuid,
  p_schedule_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Not authorized to delete survivor picks' using errcode = '42501';
  end if;

  perform set_config('app.bypass_survivor_locks', 'on', true);

  raise log 'admin_delete_survivor_pick: admin % deleting pick for entry % week %', v_admin, p_entry_id, p_schedule_id;

  delete from public.survivor_picks
  where entry_id = p_entry_id and schedule_id = p_schedule_id;
end;
$function$;

create or replace function public.admin_set_survivor_bonus_pick(
  p_entry_id uuid,
  p_schedule_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Not authorized to edit survivor bonus picks' using errcode = '42501';
  end if;

  if not exists (select 1 from public.survivor_entries where id = p_entry_id) then
    raise exception 'Survivor entry % not found', p_entry_id;
  end if;

  perform set_config('app.bypass_survivor_locks', 'on', true);

  raise log 'admin_set_survivor_bonus_pick: admin % setting bonus pick for entry % week %', v_admin, p_entry_id, p_schedule_id;

  insert into public.survivor_bonus_picks (entry_id, schedule_id, team_a_id, team_b_id)
  values (p_entry_id, p_schedule_id, p_team_a_id, p_team_b_id)
  on conflict (entry_id, schedule_id)
  do update set team_a_id = excluded.team_a_id, team_b_id = excluded.team_b_id;
end;
$function$;

create or replace function public.admin_delete_survivor_bonus_pick(
  p_entry_id uuid,
  p_schedule_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Not authorized to delete survivor bonus picks' using errcode = '42501';
  end if;

  perform set_config('app.bypass_survivor_locks', 'on', true);

  raise log 'admin_delete_survivor_bonus_pick: admin % deleting bonus pick for entry % week %', v_admin, p_entry_id, p_schedule_id;

  delete from public.survivor_bonus_picks
  where entry_id = p_entry_id and schedule_id = p_schedule_id;
end;
$function$;

-- Lock these RPCs down: only authenticated users may call them (the
-- is_admin() check inside does the real gating), matching the existing
-- grant pattern for admin_delete_survivor_entry.
revoke all on function public.admin_set_survivor_pick(uuid, uuid, uuid) from public;
revoke all on function public.admin_delete_survivor_pick(uuid, uuid) from public;
revoke all on function public.admin_set_survivor_bonus_pick(uuid, uuid, uuid, uuid) from public;
revoke all on function public.admin_delete_survivor_bonus_pick(uuid, uuid) from public;
grant execute on function public.admin_set_survivor_pick(uuid, uuid, uuid) to authenticated;
grant execute on function public.admin_delete_survivor_pick(uuid, uuid) to authenticated;
grant execute on function public.admin_set_survivor_bonus_pick(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.admin_delete_survivor_bonus_pick(uuid, uuid) to authenticated;
