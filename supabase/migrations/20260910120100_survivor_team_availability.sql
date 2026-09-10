-- Pool-wide Survivor pick availability, one row per SEC team.
--
-- available_count = number of still-active entries that have NOT yet used
-- that team (as a primary pick OR a bonus pick) in any week -- i.e. the
-- entries that could still pick that team going forward.
--
-- Like survivor_pool_stats, this is a plain (definer-rights) view so the
-- pool-wide aggregate is readable by anon/authenticated even though the
-- underlying survivor_picks rows are RLS-restricted to their owners. It
-- exposes only counts, never who picked what.

create or replace view public.survivor_team_availability as
with active as (
  select id from public.survivor_entries where status = 'active'
),
used as (
  select sp.entry_id, sp.team_id as team_id
  from public.survivor_picks sp
  join active a on a.id = sp.entry_id
  union
  select sp.entry_id, sp.bonus_team_id as team_id
  from public.survivor_picks sp
  join active a on a.id = sp.entry_id
  where sp.bonus_team_id is not null
)
select
  mt.id                                                as team_id,
  mt.school_name,
  mt.short_name,
  mt.primary_color,
  mt.secondary_color,
  mt.logo_url,
  (select count(*) from active)::int                   as active_entries,
  ((select count(*) from active) - count(distinct u.entry_id))::int as available_count
from public.master_teams mt
left join used u on u.team_id = mt.id
where mt.conference = 'SEC'
group by mt.id, mt.school_name, mt.short_name, mt.primary_color, mt.secondary_color, mt.logo_url;

grant select on public.survivor_team_availability to anon, authenticated;
