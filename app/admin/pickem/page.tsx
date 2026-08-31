import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type TeamRef = { id: string; school_name: string; short_name: string | null };
type GameRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_spread: number | null;
  pickem_spread_override: number | null;
  home_team: TeamRef;
  away_team: TeamRef;
};
type PickRow = { entry_id: string; game_id: string; team_id: string };

export default async function AdminPickemOverviewPage() {
  const supabase = await createClient();

  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("current_week_id")
    .single();
  const scheduleId = appSettings?.current_week_id ?? null;

  if (!scheduleId) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
          Pick&apos;em — Overview
        </h1>
        <p className="text-sm text-muted">No current week is set — see Season Control.</p>
      </div>
    );
  }

  const [
    { data: week },
    { count: totalEntries },
    { data: ecountRow },
    { data: entryEmailRows },
    { data: activeEmailExclusions },
    { data: gamesData },
  ] = await Promise.all([
    supabase.from("schedule").select("week_number, label").eq("id", scheduleId).single(),
    supabase
      .from("pickem_entries")
      .select("*", { count: "exact", head: true })
      .eq("schedule_id", scheduleId),
    supabase.from("pickem_week_ecount").select("ecount").eq("schedule_id", scheduleId).maybeSingle(),
    supabase.from("pickem_entries").select("entrant_email").eq("schedule_id", scheduleId),
    supabase.from("pickem_admin_emails").select("email").eq("active", true),
    supabase
      .from("games")
      .select(
        `id, home_team_id, away_team_id, home_spread, pickem_spread_override,
         home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name),
         away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name)`
      )
      .eq("schedule_id", scheduleId)
      .eq("pickem_selected", true)
      .order("kickoff_time"),
  ]);

  const games = (gamesData ?? []) as unknown as GameRow[];
  const gameIds = games.map((g) => g.id);

  const { data: pickRowsData } =
    gameIds.length > 0
      ? await supabase.from("pickem_picks").select("entry_id, game_id, team_id").in("game_id", gameIds)
      : { data: [] as PickRow[] };
  const pickRows = (pickRowsData ?? []) as PickRow[];

  // Tile C — entries excluded solely by the active email exclusion list,
  // ignoring rownum exclusions entirely (a distinct number from eCount,
  // which factors in both). Computed live against pickem_admin_emails
  // rather than reused from is_ecount_eligible, since that flag is a
  // point-in-time snapshot frozen at insert time (prepare_pickem_entry())
  // and would silently go stale if exclusions change after entries exist.
  const excludedEmailSet = new Set((activeEmailExclusions ?? []).map((e) => e.email.toLowerCase()));
  const emailExclusionOnlyCount = (entryEmailRows ?? []).filter(
    (e) => !excludedEmailSet.has((e.entrant_email || "").toLowerCase())
  ).length;

  // --- Pick distribution per game, most-picked team, chalk vs dog ---
  const gameById = new Map(games.map((g) => [g.id, g]));
  const distByGame = new Map(games.map((g) => [g.id, { home: 0, away: 0 }]));
  const teamPickCounts = new Map<string, number>();
  const teamNameById = new Map<string, string>();
  games.forEach((g) => {
    teamNameById.set(g.home_team.id, g.home_team.short_name || g.home_team.school_name);
    teamNameById.set(g.away_team.id, g.away_team.short_name || g.away_team.school_name);
  });

  let chalkCount = 0;
  let dogCount = 0;
  let pickEmLineCount = 0;

  pickRows.forEach((p) => {
    const game = gameById.get(p.game_id);
    if (!game) return;

    const dist = distByGame.get(p.game_id)!;
    if (p.team_id === game.home_team_id) dist.home++;
    else if (p.team_id === game.away_team_id) dist.away++;

    teamPickCounts.set(p.team_id, (teamPickCounts.get(p.team_id) ?? 0) + 1);

    const effectiveSpread = game.pickem_spread_override ?? game.home_spread;
    if (effectiveSpread === null || effectiveSpread === 0) {
      pickEmLineCount++;
    } else {
      const favoriteTeamId = effectiveSpread < 0 ? game.home_team_id : game.away_team_id;
      if (p.team_id === favoriteTeamId) chalkCount++;
      else dogCount++;
    }
  });

  type GameDist = {
    gameId: string;
    homeName: string;
    awayName: string;
    homeCount: number;
    awayCount: number;
    total: number;
    homePct: number;
    awayPct: number;
    leadPct: number;
  };

  const gameDists: GameDist[] = games
    .map((g) => {
      const dist = distByGame.get(g.id)!;
      const total = dist.home + dist.away;
      const homePct = total > 0 ? Math.round((dist.home / total) * 100) : 0;
      const awayPct = total > 0 ? 100 - homePct : 0;
      return {
        gameId: g.id,
        homeName: g.home_team.short_name || g.home_team.school_name,
        awayName: g.away_team.short_name || g.away_team.school_name,
        homeCount: dist.home,
        awayCount: dist.away,
        total,
        homePct,
        awayPct,
        leadPct: Math.max(homePct, awayPct),
      };
    })
    .filter((d) => d.total > 0);

  const mostLopsided = gameDists.length > 0 ? [...gameDists].sort((a, b) => b.leadPct - a.leadPct)[0] : null;
  const closest = gameDists.length > 0 ? [...gameDists].sort((a, b) => a.leadPct - b.leadPct)[0] : null;

  const topTeams = [...teamPickCounts.entries()]
    .map(([teamId, count]) => ({ teamId, name: teamNameById.get(teamId) ?? "Unknown", count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const chalkDogTotal = chalkCount + dogCount;
  const chalkPct = chalkDogTotal > 0 ? Math.round((chalkCount / chalkDogTotal) * 100) : 0;
  const dogPct = chalkDogTotal > 0 ? 100 - chalkPct : 0;

  // --- Most common exact 6-pick combination ---
  // Grouped and counted here in JS from the single pickRows query already
  // fetched above (scoped to this week's games), not a SQL GROUP BY. At
  // pool sizes of dozens-to-low-hundreds of entries this is cheap — it's
  // an O(picks) pass done fresh on every page load. If entry counts grow
  // into the thousands this should move server-side (e.g. group by
  // array_agg(game_id || ':' || team_id order by game_id) per entry, or a
  // materialized view) rather than re-grouping in JS on each request.
  const picksByEntry = new Map<string, { gameId: string; teamId: string }[]>();
  pickRows.forEach((p) => {
    const arr = picksByEntry.get(p.entry_id) ?? [];
    arr.push({ gameId: p.game_id, teamId: p.team_id });
    picksByEntry.set(p.entry_id, arr);
  });

  type Combo = { key: string; count: number; picks: { gameId: string; teamId: string }[] };
  const comboMap = new Map<string, Combo>();
  picksByEntry.forEach((picks) => {
    if (picks.length !== 6) return; // only entries with all 6 picks made count as a "combination"
    const sorted = [...picks].sort((a, b) => a.gameId.localeCompare(b.gameId));
    const key = sorted.map((p) => `${p.gameId}:${p.teamId}`).join("|");
    const existing = comboMap.get(key);
    if (existing) existing.count++;
    else comboMap.set(key, { key, count: 1, picks: sorted });
  });
  const topCombos = [...comboMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        Pick&apos;em — Overview
      </h1>
      <p className="mb-6 text-sm text-muted">
        Week {week?.week_number ?? "?"}
        {week?.label ? ` — ${week.label}` : ""}
      </p>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-edge bg-surface p-4 text-center">
          <p className="font-data text-3xl font-bold text-ink">{totalEntries ?? 0}</p>
          <p className="mt-1 text-xs text-muted">Total Entries</p>
        </div>
        <div className="rounded-lg border border-edge bg-surface p-4 text-center">
          <p className="font-data text-3xl font-bold text-ink">{ecountRow?.ecount ?? 0}</p>
          <p className="mt-1 text-xs text-muted">eCount</p>
        </div>
        <div className="rounded-lg border border-edge bg-surface p-4 text-center">
          <p className="font-data text-3xl font-bold text-ink">{emailExclusionOnlyCount}</p>
          <p className="mt-1 text-xs text-muted">Entries (Email Exclusions Only)</p>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          href="/admin/pickem/week"
          className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
        >
          Week Setup
        </Link>
        <Link
          href="/admin/pickem/entries"
          className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
        >
          Entries
        </Link>
        <Link
          href="/admin/pickem/exclusions"
          className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
        >
          Exclusions
        </Link>
      </div>

      {gameDists.length === 0 ? (
        <p className="text-sm text-muted">No picks recorded yet this week.</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {mostLopsided && (
              <div className="rounded-lg border border-gold-500/40 bg-gold-500/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-400">Most lopsided</p>
                <p className="mt-1 text-sm text-ink">
                  {mostLopsided.homePct >= mostLopsided.awayPct ? mostLopsided.homeName : mostLopsided.awayName}{" "}
                  <span className="font-data text-muted">{mostLopsided.leadPct}%</span> ({mostLopsided.total}{" "}
                  picks)
                </p>
              </div>
            )}
            {closest && (
              <div className="rounded-lg border border-edge bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Closest to even</p>
                <p className="mt-1 text-sm text-ink">
                  {closest.awayName} <span className="font-data text-muted">{closest.awayPct}%</span> /{" "}
                  {closest.homeName} <span className="font-data text-muted">{closest.homePct}%</span>
                </p>
              </div>
            )}
          </div>

          <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide text-ink">
            Pick Distribution
          </h2>
          <div className="mb-8 flex flex-col gap-2">
            {gameDists.map((d) => (
              <div key={d.gameId} className="rounded-lg border border-edge bg-surface p-3">
                <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                  <span>
                    {d.awayName} @ {d.homeName}
                  </span>
                  <span>{d.total} picks</span>
                </div>
                <div className="flex h-5 overflow-hidden rounded-md bg-app text-[11px] font-medium text-app">
                  <div
                    className="flex items-center justify-center bg-pickem-500"
                    style={{ width: `${d.awayPct}%` }}
                  >
                    {d.awayPct > 12 && `${d.awayPct}%`}
                  </div>
                  <div className="flex items-center justify-center bg-gold-500" style={{ width: `${d.homePct}%` }}>
                    {d.homePct > 12 && `${d.homePct}%`}
                  </div>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted">
                  <span>
                    {d.awayName} ({d.awayCount})
                  </span>
                  <span>
                    {d.homeName} ({d.homeCount})
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide text-ink">
                Most-Picked Teams
              </h2>
              <div className="flex flex-col gap-1.5 rounded-lg border border-edge bg-surface p-3">
                {topTeams.length === 0 ? (
                  <p className="text-sm text-muted">No picks yet.</p>
                ) : (
                  topTeams.map((t, i) => (
                    <div key={t.teamId} className="flex items-center justify-between text-sm">
                      <span className="text-ink">
                        {i + 1}. {t.name}
                      </span>
                      <span className="font-data text-muted">{t.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide text-ink">
                Chalk vs. Dog
              </h2>
              <div className="rounded-lg border border-edge bg-surface p-3">
                {chalkDogTotal === 0 ? (
                  <p className="text-sm text-muted">No spread picks to compare yet.</p>
                ) : (
                  <>
                    <div className="flex h-5 overflow-hidden rounded-md bg-app text-[11px] font-medium text-app">
                      <div
                        className="flex items-center justify-center bg-gold-500"
                        style={{ width: `${chalkPct}%` }}
                      >
                        {chalkPct > 12 && `${chalkPct}%`}
                      </div>
                      <div
                        className="flex items-center justify-center bg-pickem-500"
                        style={{ width: `${dogPct}%` }}
                      >
                        {dogPct > 12 && `${dogPct}%`}
                      </div>
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs text-muted">
                      <span>Chalk (favorite) — {chalkCount}</span>
                      <span>Dog (underdog) — {dogCount}</span>
                    </div>
                  </>
                )}
                {pickEmLineCount > 0 && (
                  <p className="mt-2 text-[11px] text-muted">
                    {pickEmLineCount} pick{pickEmLineCount === 1 ? "" : "s"} on a pick&apos;em (0-point) line
                    excluded — no favorite to compare against.
                  </p>
                )}
              </div>
            </div>
          </div>

          <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide text-ink">
            Most Common 6-Pick Combination
          </h2>
          {topCombos.length === 0 ? (
            <p className="text-sm text-muted">No entry has all 6 picks in yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {topCombos.map((combo, i) => (
                <div key={combo.key} className="rounded-lg border border-edge bg-surface p-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted">
                    <span>#{i + 1}</span>
                    <span className="font-data text-ink">
                      {combo.count} {combo.count === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                  <p className="text-sm text-ink">
                    {combo.picks.map((p) => teamNameById.get(p.teamId) ?? "?").join(", ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
