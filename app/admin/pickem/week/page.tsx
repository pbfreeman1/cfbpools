import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updatePickemGame, clearPickemSpreadOverride } from "@/app/actions/admin-pickem";
import { triggerSync } from "@/app/actions/admin-system";
import { getMatchupPrefix } from "@/app/components/MatchupLine";

type TeamRef = {
  id: string;
  school_name: string;
  short_name: string | null;
  logo_url: string | null;
};

type GameRow = {
  id: string;
  kickoff_time: string;
  status: string;
  home_spread: number | null;
  pickem_spread_override: number | null;
  pickem_selected: boolean;
  home_team: TeamRef;
  away_team: TeamRef;
};

function TeamLabel({ team }: { team: TeamRef }) {
  return (
    <span className="flex items-center gap-2">
      {team.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo_url} alt="" className="h-5 w-5 flex-shrink-0 object-contain" />
      )}
      <span className="text-sm font-medium text-ink">{team.short_name || team.school_name}</span>
    </span>
  );
}

export default async function AdminPickemWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ schedule_id?: string; error?: string; saved?: string; synced?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: appSettings }, { data: weeks }] = await Promise.all([
    supabase.from("app_settings").select("current_week_id").single(),
    supabase
      .from("schedule")
      .select("id, season, week_number")
      .order("season", { ascending: false })
      .order("week_number"),
  ]);

  const scheduleId = params.schedule_id || appSettings?.current_week_id || "";

  let week: { week_number: number; label: string | null } | null = null;
  let games: GameRow[] = [];

  if (scheduleId) {
    const [{ data: weekData }, { data: gamesData }] = await Promise.all([
      supabase.from("schedule").select("week_number, label").eq("id", scheduleId).single(),
      supabase
        .from("games")
        .select(
          `id, kickoff_time, status, home_spread, pickem_spread_override, pickem_selected,
           home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name, logo_url),
           away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name, logo_url)`
        )
        .eq("schedule_id", scheduleId)
        .order("kickoff_time"),
    ]);
    week = weekData;
    games = (gamesData ?? []) as unknown as GameRow[];
  }

  const selectedCount = games.filter((g) => g.pickem_selected).length;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        Pick&apos;em — Week Setup
      </h1>
      <p className="mb-6 text-sm text-muted">
        Choose which games are in this week&apos;s Pick&apos;em pool and set spread overrides.
      </p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}
      {params.saved && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">Saved.</p>
      )}
      {params.synced && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Sync complete — {params.synced}.
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <form action="/admin/pickem/week" method="GET" className="flex flex-wrap items-center gap-2">
          <select
            name="schedule_id"
            defaultValue={scheduleId}
            className="rounded-md border border-edge bg-app px-3 py-1.5 text-sm text-ink"
          >
            <option value="">— Select a week —</option>
            {(weeks ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.season} — Week {w.week_number}
                {w.id === appSettings?.current_week_id ? " (current)" : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
          >
            Go
          </button>
        </form>

        <form action={triggerSync}>
          <input
            type="hidden"
            name="returnTo"
            value={scheduleId ? `/admin/pickem/week?schedule_id=${scheduleId}` : "/admin/pickem/week"}
          />
          <button
            type="submit"
            className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
          >
            Sync lines from CFBD
          </button>
        </form>
      </div>

      {!scheduleId ? (
        <p className="text-sm text-muted">
          Select a week above, or{" "}
          <Link href="/admin/season" className="text-gold-400 hover:underline">
            set a current week in Season Control
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">
              Week {week?.week_number ?? "?"}
            </h2>
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                selectedCount < 6 ? "bg-gold-500/10 text-gold-400" : "bg-alive/10 text-alive"
              }`}
            >
              {selectedCount} selected{selectedCount < 6 ? " — fewer than 6" : ""}
            </span>
          </div>
          {week?.label && <p className="mb-4 text-sm text-muted">{week.label}</p>}

          <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
            {games.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted">No games scheduled for this week.</p>
            )}
            {games.map((g) => {
              const hasOverride = g.pickem_spread_override !== null;
              const effectiveSpread = g.pickem_spread_override ?? g.home_spread;
              return (
                <div key={g.id} className="px-4 py-3">
                  <form action={updatePickemGame} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <input type="hidden" name="gameId" value={g.id} />
                    <input type="hidden" name="scheduleId" value={scheduleId} />

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="pickemSelected"
                        defaultChecked={g.pickem_selected}
                        className="accent-gold-500"
                      />
                      <span className="text-xs font-medium uppercase text-muted">Include</span>
                    </label>

                    <div className="flex flex-col gap-1">
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        {getMatchupPrefix(g.away_team.id, g.home_team.id)}
                      </span>
                      <TeamLabel team={g.away_team} />
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        {getMatchupPrefix(g.home_team.id, g.home_team.id)}
                      </span>
                      <TeamLabel team={g.home_team} />
                    </div>

                    <span className="text-xs text-muted">{new Date(g.kickoff_time).toLocaleString()}</span>

                    <div className="ml-auto flex items-center gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium uppercase text-muted">Home spread</span>
                        <input
                          type="number"
                          step="0.5"
                          name="spreadOverride"
                          required
                          defaultValue={effectiveSpread ?? ""}
                          className="w-24 rounded-md border border-edge bg-app px-2 py-1 text-sm text-ink"
                        />
                      </label>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          hasOverride ? "bg-gold-500/10 text-gold-400" : "bg-surface-hover text-muted"
                        }`}
                      >
                        {hasOverride ? "Override active" : "CFBD synced"}
                      </span>
                      <span className="text-xs text-muted">CFBD: {g.home_spread ?? "—"}</span>
                      <button
                        type="submit"
                        className="rounded-md bg-gold-500 px-3 py-1.5 text-xs font-semibold text-app transition hover:bg-gold-600"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                  {hasOverride && (
                    <form action={clearPickemSpreadOverride} className="mt-1">
                      <input type="hidden" name="gameId" value={g.id} />
                      <input type="hidden" name="scheduleId" value={scheduleId} />
                      <button type="submit" className="text-xs font-medium text-gold-400 hover:underline">
                        Clear override
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
