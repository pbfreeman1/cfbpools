import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeEliminations, buildTeamResultMap, type SurvivorPick, type GameResult } from "@/lib/survivorElimination";
import { commitWeekResults, reinstateEntry } from "@/app/actions/admin-survivor";
import { getMatchupPrefix } from "@/app/components/MatchupLine";
import { formatKickoff } from "@/lib/formatDate";

type TeamRef = {
  id: string;
  school_name: string;
  short_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
};

type GameRow = {
  id: string;
  kickoff_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
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

export default async function AdminSurvivorResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const isPreview = params.preview === "1";
  const supabase = await createClient();

  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("current_week_id")
    .single();

  if (!appSettings?.current_week_id) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
          Weekly Results
        </h1>
        <p className="text-sm text-muted">
          No current week is set.{" "}
          <Link href="/admin/season" className="text-gold-400 hover:underline">
            Set it in Season Control
          </Link>{" "}
          before entering results.
        </p>
      </div>
    );
  }

  const scheduleId = appSettings.current_week_id;

  const { data: week } = await supabase
    .from("schedule")
    .select("week_number, label")
    .eq("id", scheduleId)
    .single();
  const weekNumber = week?.week_number ?? 0;

  const { data: gamesData } = await supabase
    .from("games")
    .select(
      `id, kickoff_time, status, home_score, away_score,
       home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name, logo_url, primary_color),
       away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name, logo_url, primary_color)`
    )
    .eq("schedule_id", scheduleId)
    .order("kickoff_time");
  const games = (gamesData ?? []) as unknown as GameRow[];

  // Real final results + (in preview mode only) the admin's proposed
  // winners for games that aren't final yet, read out of the query string.
  const overrideWinnerByGameId = new Map<string, string>();
  if (isPreview) {
    for (const g of games) {
      const raw = params[`game_${g.id}`];
      const winnerId = Array.isArray(raw) ? raw[0] : raw;
      if (winnerId) overrideWinnerByGameId.set(g.id, winnerId);
    }
  }
  const gameResults: GameResult[] = games.map((g) => ({
    id: g.id,
    status: g.status,
    homeScore: g.home_score,
    awayScore: g.away_score,
    homeTeamId: g.home_team.id,
    awayTeamId: g.away_team.id,
  }));
  const teamResult = buildTeamResultMap(gameResults, overrideWinnerByGameId);

  const { data: pickRows } = await supabase
    .from("survivor_picks")
    .select(
      `entry_id, team_id, bonus_team_id, is_bonus_week,
       entry:survivor_entries!survivor_picks_entry_id_fkey(id, entry_name, entry_number, status)`
    )
    .eq("schedule_id", scheduleId);

  const activePicks = (pickRows ?? []).filter((p) => {
    const entry = p.entry as unknown as { status: string } | null;
    return entry?.status === "active";
  });

  const picks: SurvivorPick[] = activePicks.map((p) => {
    const entry = p.entry as unknown as { id: string; entry_name: string | null; entry_number: number };
    return {
      entryId: entry.id,
      entryName: entry.entry_name || `Entry ${entry.entry_number}`,
      isBonusWeek: p.is_bonus_week,
      teamId: p.team_id,
      bonusTeamId: p.bonus_team_id,
    };
  });

  const { data: activeEntries } = await supabase
    .from("survivor_entries")
    .select("id, entry_name, entry_number")
    .eq("status", "active");

  const pickedEntryIds = new Set(activePicks.map((p) => p.entry_id));
  const noPickEntries = (activeEntries ?? []).filter((e) => !pickedEntryIds.has(e.id));

  const { data: eliminatedEntries } = await supabase
    .from("survivor_entries")
    .select("id, entry_name, entry_number, eliminated_week_number")
    .eq("status", "eliminated")
    .order("eliminated_week_number", { ascending: false });

  const { eliminations, pending } = computeEliminations(picks, teamResult, weekNumber);

  // Which non-final games actually have a submitted winner — these are the
  // only game_<id> fields the confirm form needs to carry forward.
  const overrideGameIds = games
    .filter((g) => g.status !== "final")
    .filter((g) => {
      const raw = params[`game_${g.id}`];
      const winnerId = Array.isArray(raw) ? raw[0] : raw;
      return winnerId === g.home_team.id || winnerId === g.away_team.id;
    })
    .map((g) => g.id);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        Weekly Results — Week {weekNumber}
      </h1>
      <p className="mb-6 text-sm text-muted">{week?.label}</p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}
      {params.committed !== undefined && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Committed — {params.committed} {params.committed === "1" ? "entry" : "entries"} eliminated.
        </p>
      )}
      {params.reinstated && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">Entry reinstated.</p>
      )}

      {isPreview ? (
        <>
          <div className="mb-6 rounded-lg border border-gold-500 bg-gold-500/10 p-4">
            <p className="text-sm font-semibold text-gold-400">Review before committing</p>
            <p className="mt-1 text-xs text-muted">
              This is a preview — nothing has been saved yet. Confirm to apply results and run
              eliminations.
            </p>
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Entries to be eliminated ({eliminations.length})
          </h2>
          {eliminations.length === 0 ? (
            <p className="mb-6 text-sm text-muted">None — no active entry&apos;s pick lost this week.</p>
          ) : (
            <ul className="mb-6 divide-y divide-edge rounded-lg border border-edge bg-surface">
              {eliminations.map((e) => (
                <li key={e.entryId} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm font-medium text-ink">{e.entryName}</span>
                  <span className="text-xs text-dead">{e.reason}</span>
                </li>
              ))}
            </ul>
          )}

          {pending.length > 0 && (
            <p className="mb-6 text-xs text-muted">
              {pending.length} {pending.length === 1 ? "entry has" : "entries have"} a pick riding on
              a game that&apos;s still undecided — left untouched until that game gets a winner.
            </p>
          )}

          <form action={commitWeekResults} className="mb-10 flex gap-3">
            <input type="hidden" name="scheduleId" value={scheduleId} />
            {overrideGameIds.map((id) => (
              <input key={id} type="hidden" name={`game_${id}`} value={params[`game_${id}`] as string} />
            ))}
            <button
              type="submit"
              className="rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600"
            >
              Confirm &amp; Commit
            </button>
            <Link
              href="/admin/survivor/results"
              className="rounded-md border border-edge px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-hover"
            >
              Change selections
            </Link>
          </form>
        </>
      ) : (
        <form action="/admin/survivor/results" method="GET" className="mb-10">
          <input type="hidden" name="preview" value="1" />
          <div className="mb-4 divide-y divide-edge rounded-lg border border-edge bg-surface">
            {games.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted">No games scheduled for this week.</p>
            )}
            {games.map((g) => {
              const isFinal = g.status === "final" && g.home_score !== null && g.away_score !== null;
              const homeWon = isFinal && (g.home_score as number) > (g.away_score as number);
              return (
                <div key={g.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2">
                      {!isFinal && (
                        <input type="radio" name={`game_${g.id}`} value={g.home_team.id} className="accent-gold-500" />
                      )}
                      <span className="text-xs text-muted">{getMatchupPrefix(g.home_team.id, g.home_team.id)}</span>
                      <TeamLabel team={g.home_team} />
                      {isFinal && homeWon && <span className="text-xs font-semibold text-alive">W</span>}
                    </label>
                    <label className="flex items-center gap-2">
                      {!isFinal && (
                        <input type="radio" name={`game_${g.id}`} value={g.away_team.id} className="accent-gold-500" />
                      )}
                      <span className="text-xs text-muted">{getMatchupPrefix(g.away_team.id, g.home_team.id)}</span>
                      <TeamLabel team={g.away_team} />
                      {isFinal && !homeWon && <span className="text-xs font-semibold text-alive">W</span>}
                    </label>
                  </div>
                  <span className="text-xs font-medium uppercase text-muted">
                    {isFinal ? "Final (synced)" : formatKickoff(g.kickoff_time)}
                  </span>
                </div>
              );
            })}
          </div>
          <button
            type="submit"
            className="rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600"
          >
            Preview Eliminations
          </button>
          <p className="mt-2 text-xs text-muted">
            Games already marked Final were synced from CFBD and can&apos;t be changed here — only
            pick a winner for games CFBD hasn&apos;t settled yet.
          </p>
        </form>
      )}

      {noPickEntries.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            No pick for Week {weekNumber} ({noPickEntries.length})
          </h2>
          <p className="mb-2 text-xs text-muted">
            Not eliminated by this tool — review manually if your rules treat a missed pick as a loss.
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink">
            {noPickEntries.map((e) => (
              <span key={e.id}>{e.entry_name || `Entry ${e.entry_number}`}</span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Eliminated entries ({eliminatedEntries?.length ?? 0})
        </h2>
        {!eliminatedEntries || eliminatedEntries.length === 0 ? (
          <p className="text-sm text-muted">No eliminations yet.</p>
        ) : (
          <ul className="divide-y divide-edge rounded-lg border border-edge bg-surface">
            {eliminatedEntries.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-ink">
                  {e.entry_name || `Entry ${e.entry_number}`}{" "}
                  <span className="text-xs text-muted">— eliminated Week {e.eliminated_week_number}</span>
                </span>
                <form action={reinstateEntry}>
                  <input type="hidden" name="entryId" value={e.id} />
                  <button type="submit" className="text-xs font-medium text-gold-400 hover:underline">
                    Reinstate
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
