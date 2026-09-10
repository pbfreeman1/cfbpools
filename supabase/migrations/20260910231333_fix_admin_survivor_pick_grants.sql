-- Tighten the grants from the previous migration: revoke from anon too, so
-- these admin RPCs are callable only by authenticated sessions (the
-- is_admin() check inside still does the real authorization).
revoke all on function public.admin_set_survivor_pick(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_survivor_pick(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_set_survivor_bonus_pick(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_survivor_bonus_pick(uuid, uuid) from public, anon, authenticated;

grant execute on function public.admin_set_survivor_pick(uuid, uuid, uuid) to authenticated;
grant execute on function public.admin_delete_survivor_pick(uuid, uuid) to authenticated;
grant execute on function public.admin_set_survivor_bonus_pick(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.admin_delete_survivor_bonus_pick(uuid, uuid) to authenticated;
