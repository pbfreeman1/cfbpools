import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updatePickemGame, clearPickemSpreadOverride, bulkSetPickemSelection } from "@/app/actions/admin-pickem";
import { triggerSync } from "@/app/actions/admin-system";
import { GameMatchupLine } from "@/app/components/MatchupLine";
import { formatKickoff } from "@/lib/formatDate";
import CheckboxBulkToggle from "./CheckboxBulkToggle";

const BULK_FORM_ID = "pickem-bulk-select-form";

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

export default async function AdminPickemWeekPage({
  searchParams,
}: {
  searchParams: Promise<{
    schedule_id?: string;
    error?: string;
    saved?: string;
    synced?: string;
    added?: string;
    removed?: string;
  }>;
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
      {params.added !== undefined && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Added {params.added} game{params.added === "1" ? "" : "s"}, removed{" "}
          {params.removed ?? "0"} game{params.removed === "1" ? "" : "s"}.
        </p>
      )}

      <form action="/admin/pickem/week" method="GET" className="mb-6 flex flex-wrap items-center gap-2">
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
              {selectedCount} added{selectedCount < 6 ? " — fewer than 6" : ""}
            </span>
          </div>
          {week?.label && <p className="mb-4 text-sm text-muted">{week.label}</p>}

          {/* Step 1 — refresh data. Never writes pickem_selected/pickem_spread_override. */}
          <div className="mb-4 rounded-lg border border-edge bg-surface p-3">
            <form action={triggerSync} className="flex flex-wrap items-center justify-between gap-3">
              <input
                type="hidden"
                name="returnTo"
                value={`/admin/pickem/week?schedule_id=${scheduleId}`}
              />
              <input type="hidden" name="week" value={week?.week_number ?? ""} />
              <p className="text-xs text-muted">
                <span className="font-semibold text-ink">Step 1.</span> Refresh this week&apos;s
                games and lines from CFBD before selecting — this never changes what&apos;s
                added or any locked spread.
              </p>
              <button
                type="submit"
                className="flex-shrink-0 rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
              >
                Sync lines from CFBD
              </button>
            </form>
          </div>

          {/* Step 2 — stage checkboxes locally, commit with one submit. */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-1 text-xs">
                <span className="font-semibold text-ink">Step 2.</span>{" "}
                <span className="text-muted">
                  Every box below starts checked — uncheck what you don&apos;t want, then
                  submit.
                </span>
              </p>
              <CheckboxBulkToggle formId={BULK_FORM_ID} />
            </div>
            <form id={BULK_FORM_ID} action={bulkSetPickemSelection}>
              <input type="hidden" name="scheduleId" value={scheduleId} />
              <button
                type="submit"
                className="rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600"
              >
                Add Selected Games
              </button>
            </form>
          </div>

          <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
            {games.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted">No games scheduled for this week.</p>
            )}
            {games.map((g) => {
              const hasOverride = g.pickem_spread_override !== null;
              // Added games show the locked, frozen truth; not-yet-added
              // games preview the live CFBD value that submitting would lock.
              const spreadDefaultValue = g.pickem_selected
                ? g.pickem_spread_override ?? g.home_spread
                : g.home_spread;
              return (
                <div
                  key={g.id}
                  className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:gap-y-1"
                >
                  {/* display:contents so the single save form's children act as
                      direct grid items of the row above, instead of the form
                      itself boxing them into one grid cell. */}
                  <form action={updatePickemGame} className="contents">
                    <input type="hidden" name="gameId" value={g.id} />
                    <input type="hidden" name="scheduleId" value={scheduleId} />
                    {/* Mirrors the game's current DB selection state (not the
                        staging checkbox below, which belongs to the master
                        bulk form via form=) so Save only ever changes the
                        spread, never accidentally flips selection. */}
                    {g.pickem_selected && <input type="hidden" name="pickemSelected" value="on" />}

                    <div className="flex flex-col items-start gap-1 pt-0.5">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="gameIds"
                          value={g.id}
                          form={BULK_FORM_ID}
                          defaultChecked
                          className="accent-gold-500"
                        />
                        <span className="text-xs font-medium uppercase text-muted">Include</span>
                      </label>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          g.pickem_selected ? "bg-alive/10 text-alive" : "bg-surface-hover text-muted"
                        }`}
                      >
                        {g.pickem_selected ? "Added" : "Not added"}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <GameMatchupLine
                        home={{
                          id: g.home_team.id,
                          name: g.home_team.short_name || g.home_team.school_name,
                          logo_url: g.home_team.logo_url,
                        }}
                        away={{
                          id: g.away_team.id,
                          name: g.away_team.short_name || g.away_team.school_name,
                          logo_url: g.away_team.logo_url,
                        }}
                      />
                      <p className="mt-1 text-xs text-muted">{formatKickoff(g.kickoff_time)}</p>
                    </div>

                    <div className="col-span-2 flex flex-col items-end gap-1.5 sm:col-span-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          name="spreadOverride"
                          required
                          defaultValue={spreadDefaultValue ?? ""}
                          className="w-20 rounded-md border border-edge bg-app px-2 py-1 text-right text-sm text-ink"
                        />
                        <button
                          type="submit"
                          className="rounded-md bg-gold-500 px-3 py-1.5 text-xs font-semibold text-app transition hover:bg-gold-600"
                        >
                          Save
                        </button>
                      </div>
                      <div className="flex items-center gap-2 whitespace-nowrap text-xs">
                        <span
                          className={`rounded px-2 py-0.5 font-medium ${
                            hasOverride ? "bg-gold-500/10 text-gold-400" : "bg-surface-hover text-muted"
                          }`}
                        >
                          {hasOverride ? "Override active" : "CFBD synced"}
                        </span>
                        <span className="text-muted">CFBD: {g.home_spread ?? "—"}</span>
                        {hasOverride && (
                          <button
                            type="submit"
                            formAction={clearPickemSpreadOverride}
                            className="font-medium text-gold-400 hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </form>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
