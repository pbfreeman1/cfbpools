import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEASON, ENTRY_DEADLINE } from "@/lib/season";
import { isReadableOnDark } from "@/lib/color";
import CountdownTimer from "@/app/components/CountdownTimer";
import MatchupStrip from "@/app/components/MatchupStrip";

type TeamRef = {
  id: string;
  school_name: string;
  short_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
};

type CellData = {
  locked: boolean;
  pick: {
    shortName: string;
    logoUrl: string | null;
    color: string | null;
    isBonus: boolean;
    bonusShortName: string | null;
  } | null;
};

export default async function SurvivorHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public pool-wide info — visible whether or not you're logged in.
  const { data: stats } = await supabase.from("survivor_pool_stats").select("*").single();

  const { data: weeks } = await supabase
    .from("schedule")
    .select("id, week_number, start_date, end_date")
    .eq("season", SEASON)
    .order("week_number");

  const today = new Date();
  const currentWeek =
    (weeks ?? []).find((w) => today >= new Date(w.start_date) && today <= new Date(w.end_date)) ??
    (weeks ?? []).find((w) => new Date(w.start_date) > today);

  const deadlinePassed = today > ENTRY_DEADLINE;

  let nextKickoff: string | null = null;
  if (currentWeek) {
    const { data: nextGame } = await supabase
      .from("games")
      .select("kickoff_time")
      .eq("schedule_id", currentWeek.id)
      .gt("kickoff_time", today.toISOString())
      .order("kickoff_time")
      .limit(1)
      .maybeSingle();
    nextKickoff = nextGame?.kickoff_time ?? null;
  }

  // Personalized section — only meaningful if logged in.
  let entries: { id: string; entry_number: number; entry_name: string | null; status: string }[] =
    [];
  // entryId -> scheduleId -> cell data, for the week-by-week grid.
  const grid = new Map<string, Map<string, CellData>>();

  if (user) {
    const { data } = await supabase
      .from("survivor_entries")
      .select("id, entry_number, entry_name, status")
      .eq("user_id", user.id)
      .order("entry_number");
    entries = data ?? [];

    if (entries.length > 0 && weeks && weeks.length > 0) {
      const entryIds = entries.map((e) => e.id);
      const scheduleIds = weeks.map((w) => w.id);

      const { data: picks } = await supabase
        .from("survivor_picks")
        .select(
          `entry_id, schedule_id, is_bonus_week,
           team:master_teams!survivor_picks_team_id_fkey(id, school_name, short_name, logo_url, primary_color),
           bonus_team:master_teams!survivor_picks_bonus_team_id_fkey(id, school_name, short_name, logo_url, primary_color)`
        )
        .in("entry_id", entryIds);

      const { data: games } = await supabase
        .from("games")
        .select(
          `schedule_id, kickoff_time,
           home_team:master_teams!games_home_team_id_fkey(id, conference),
           away_team:master_teams!games_away_team_id_fkey(id, conference)`
        )
        .in("schedule_id", scheduleIds);

      const nowMs = Date.now();

      // For "no pick made" cells: a week only counts as locked once every
      // SEC game that week has kicked off — otherwise there's still time.
      const secAllKickedOffByWeek = new Map<string, boolean>();
      (weeks ?? []).forEach((w) => {
        const weekGames = (games ?? []).filter((g) => g.schedule_id === w.id);
        const secGames = weekGames.filter((g) => {
          const home = g.home_team as unknown as { conference: string };
          const away = g.away_team as unknown as { conference: string };
          return home.conference === "SEC" || away.conference === "SEC";
        });
        secAllKickedOffByWeek.set(
          w.id,
          secGames.length > 0 && secGames.every((g) => new Date(g.kickoff_time).getTime() <= nowMs)
        );
      });

      entries.forEach((e) => grid.set(e.id, new Map()));

      (picks ?? []).forEach((p) => {
        const team = p.team as unknown as TeamRef;
        const bonusTeam = p.bonus_team as unknown as TeamRef | null;

        const relevantGames = (games ?? []).filter((g) => {
          if (g.schedule_id !== p.schedule_id) return false;
          const home = g.home_team as unknown as { id: string };
          const away = g.away_team as unknown as { id: string };
          const ids = [home.id, away.id];
          return (
            ids.includes(team.id) || (bonusTeam && p.is_bonus_week && ids.includes(bonusTeam.id))
          );
        });
        const earliestKickoff = relevantGames.length
          ? Math.min(...relevantGames.map((g) => new Date(g.kickoff_time).getTime()))
          : Infinity;

        grid.get(p.entry_id)?.set(p.schedule_id, {
          locked: nowMs >= earliestKickoff,
          pick: {
            shortName: team.short_name || team.school_name,
            logoUrl: team.logo_url,
            color: team.primary_color,
            isBonus: p.is_bonus_week,
            bonusShortName: bonusTeam ? bonusTeam.short_name || bonusTeam.school_name : null,
          },
        });
      });

      // Fill in "no pick" cells for weeks with nothing recorded yet.
      entries.forEach((e) => {
        (weeks ?? []).forEach((w) => {
          if (!grid.get(e.id)?.has(w.id)) {
            grid.get(e.id)?.set(w.id, {
              locked: secAllKickedOffByWeek.get(w.id) ?? false,
              pick: null,
            });
          }
        });
      });
    }
  }
  const canCreateAnother = user && entries.length < 2 && !deadlinePassed;

  const missingPickEntries: { id: string; name: string }[] = [];
  if (user && currentWeek) {
    entries.forEach((e) => {
      const cell = grid.get(e.id)?.get(currentWeek.id);
      if (e.status === "active" && cell && !cell.pick && !cell.locked) {
        missingPickEntries.push({ id: e.id, name: e.entry_name || `Entry ${e.entry_number}` });
      }
    });
  }

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl lg:max-w-5xl">
      <Link href="/" className="mb-4 inline-block text-sm text-gold-400 hover:underline">
        &larr; All pools
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        SEC Survivor Pool
      </h1>
      <p className="mb-6 text-sm text-muted">
        Pick one SEC team to win each week. 16 teams, 14 weeks — use your 2 bonus picks wisely.
      </p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}

      {missingPickEntries.length > 0 && currentWeek && (
        <div className="mb-6 rounded-md border border-gold-500 bg-gold-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-gold-400">
            {missingPickEntries.length === 1
              ? `${missingPickEntries[0].name} hasn't picked for Week ${currentWeek.week_number} yet.`
              : `${missingPickEntries.length} entries haven't picked for Week ${currentWeek.week_number} yet.`}
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {missingPickEntries.map((e) => (
              <Link
                key={e.id}
                href={`/survivor/${e.id}?week=${currentWeek.week_number}`}
                className="text-sm font-medium text-gold-400 hover:underline"
              >
                Pick now for {e.name} &rarr;
              </Link>
            ))}
          </div>
        </div>
      )}

      <MatchupStrip />

      {/* Public pool stats */}
      <div className="mb-6 grid grid-cols-3 gap-2 rounded-lg border border-edge bg-surface p-4 text-center">
        <div>
          <p className="text-xl font-bold text-ink">{stats?.total_entries ?? 0}</p>
          <p className="text-xs text-muted">Entries</p>
        </div>
        <div>
          <p className="text-xl font-bold text-alive">{stats?.active_entries ?? 0}</p>
          <p className="text-xs text-muted">Alive</p>
        </div>
        <div>
          <p className="text-xl font-bold text-dead">{stats?.eliminated_entries ?? 0}</p>
          <p className="text-xs text-muted">Eliminated</p>
        </div>
      </div>

      {nextKickoff && (
        <div className="mb-6">
          <CountdownTimer target={nextKickoff} label="Next kickoff locks picks in" />
        </div>
      )}

      <p className="mb-6 text-center text-sm text-muted">
        {currentWeek ? (
          <>
            Current week: <span className="font-medium">Week {currentWeek.week_number}</span>
          </>
        ) : (
          "Season schedule not yet loaded"
        )}
        {!deadlinePassed && (
          <>
            {" "}
            &middot; Entry deadline{" "}
            <span className="font-medium">
              {ENTRY_DEADLINE.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </>
        )}
      </p>

      {/* Quick actions */}
      <div className={canCreateAnother ? "mb-8 grid grid-cols-3 gap-2" : "mb-8 grid grid-cols-2 gap-2"}>
        <Link
          href="/survivor/locked"
          className="rounded-md border border-edge px-3 py-2.5 text-center text-sm font-medium text-ink transition hover:bg-surface-hover"
        >
          View Picks
        </Link>
        <Link
          href="/survivor/rules"
          className="rounded-md border border-edge px-3 py-2.5 text-center text-sm font-medium text-ink transition hover:bg-surface-hover"
        >
          Rules
        </Link>
        {canCreateAnother && (
          <Link
            href="/survivor/new"
            className="rounded-md bg-gold-500 px-3 py-2.5 text-center text-sm font-semibold text-app transition hover:bg-gold-600"
          >
            + New Entry
          </Link>
        )}
      </div>

      {/* Personalized section */}
      {!user ? (
        <div className="rounded-lg border border-edge bg-surface p-4 text-center">
          <p className="mb-3 text-sm text-muted">Log in to make your picks.</p>
          <Link
            href="/login"
            className="inline-block rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600"
          >
            Log in
          </Link>
        </div>
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Your entries
          </h2>
          {entries.length === 0 ? (
            <p className="mb-4 text-sm text-muted">You don&apos;t have an entry yet.</p>
          ) : (
            <div className="no-scrollbar -mx-6 mb-4 overflow-x-auto px-6">
              <table className="border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-[120px] bg-app px-2 text-left text-xs font-medium uppercase tracking-wide text-muted">
                      Entry
                    </th>
                    {(weeks ?? []).map((w) => (
                      <th
                        key={w.id}
                        className="px-0.5 text-center font-data text-xs font-medium text-muted"
                      >
                        Wk{w.week_number}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="sticky left-0 z-10 min-w-[120px] bg-app pr-3">
                        <Link
                          href={`/survivor/${entry.id}`}
                          className="block whitespace-nowrap text-sm font-medium text-ink hover:text-gold-400"
                        >
                          {entry.entry_name || `Entry ${entry.entry_number}`}
                        </Link>
                        <span
                          className={
                            entry.status === "eliminated"
                              ? "text-xs font-medium text-dead"
                              : "text-xs font-medium text-alive"
                          }
                        >
                          {entry.status === "eliminated" ? "Eliminated" : "Alive"}
                        </span>
                      </td>
                      {(weeks ?? []).map((w) => {
                        const cell = grid.get(entry.id)?.get(w.id) ?? { locked: false, pick: null };
                        const base =
                          "flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border text-center";

                        const inner = cell.pick ? (
                          <>
                            {cell.pick.logoUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cell.pick.logoUrl} alt="" className="h-5 w-5" />
                            )}
                            {cell.pick.color && (
                              <span
                                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: cell.pick.color }}
                              />
                            )}
                            <span
                              className="max-w-[52px] truncate text-[10px] font-semibold text-ink"
                              style={
                                !cell.locked && isReadableOnDark(cell.pick.color)
                                  ? { color: cell.pick.color as string }
                                  : undefined
                              }
                            >
                              {cell.pick.shortName}
                            </span>
                            {cell.pick.isBonus && (
                              <span className="text-[9px] leading-none text-gold-400">
                                &#9733; bonus
                              </span>
                            )}
                          </>
                        ) : cell.locked ? (
                          <span className="text-lg leading-none text-dead">&#10005;</span>
                        ) : (
                          <span className="text-lg leading-none text-muted">+</span>
                        );

                        if (cell.locked) {
                          return (
                            <td key={w.id}>
                              <div className={`${base} border-edge bg-app opacity-50`}>{inner}</div>
                            </td>
                          );
                        }

                        return (
                          <td key={w.id}>
                            <Link
                              href={`/survivor/${entry.id}?week=${w.week_number}`}
                              className={`${base} ${
                                cell.pick
                                  ? "border-edge bg-surface hover:bg-surface-hover"
                                  : "border-dashed border-edge bg-app hover:bg-surface-hover"
                              }`}
                            >
                              {inner}
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {deadlinePassed && entries.length === 0 && (
            <p className="text-center text-sm text-dead">Entry deadline has passed.</p>
          )}
        </>
      )}
    </main>
  );
}
