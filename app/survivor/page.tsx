import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEASON, ENTRY_DEADLINE } from "@/lib/season";
import { fetchAll } from "@/lib/supabase/fetchAll";
import { isReadableOnDark } from "@/lib/color";
import { formatMonthDay } from "@/lib/formatDate";
import CountdownTimer from "@/app/components/CountdownTimer";
import MatchupStrip from "@/app/components/MatchupStrip";
import EntryCreatedModal from "@/app/survivor/EntryCreatedModal";
import TeamAvailabilityChart, {
  type TeamAvailabilityRow,
} from "@/app/survivor/TeamAvailabilityChart";

type TeamRef = {
  id: string;
  school_name: string;
  short_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
};

type CellData = {
  locked: boolean;
  // Outcome of a locked pick, from final game scores. "pending" = locked but
  // not every game involved has finished (a bonus week stays pending until
  // both games are final, unless one team has already lost). null = no pick
  // or not locked yet.
  result: "won" | "lost" | "pending" | null;
  // Week is after the entry's elimination week: the cell is moot, whatever
  // pick data sits in it never counted.
  voided: boolean;
  pick: {
    shortName: string;
    logoUrl: string | null;
    color: string | null;
    isBonus: boolean;
    bonusShortName: string | null;
    bonusLogoUrl: string | null;
    bonusColor: string | null;
  } | null;
};

type GameRow = {
  id: string;
  schedule_id: string;
  kickoff_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_team: { id: string; conference: string };
  away_team: { id: string; conference: string };
};

// Did `teamId` win its game this week? "pending" until the game is final
// with scores recorded (also covers a team with no game found).
function teamOutcome(weekGames: GameRow[], teamId: string): "won" | "lost" | "pending" {
  const g = weekGames.find((x) => x.home_team.id === teamId || x.away_team.id === teamId);
  if (!g || g.status !== "final" || g.home_score === null || g.away_score === null) {
    return "pending";
  }
  const mine = g.home_team.id === teamId ? g.home_score : g.away_score;
  const theirs = g.home_team.id === teamId ? g.away_score : g.home_score;
  return mine > theirs ? "won" : "lost";
}

export default async function SurvivorHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; bonus_saved?: string; week?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public pool-wide info — visible whether or not you're logged in.
  const { data: stats } = await supabase.from("survivor_pool_stats").select("*").single();

  const { data: teamAvailability } = await supabase
    .from("survivor_team_availability")
    .select(
      "team_id, school_name, short_name, primary_color, logo_url, active_entries, available_count"
    );

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
    // Only SEC-involving games can lock a Survivor pick, so the "next lock"
    // countdown must ignore non-SEC games that week (same eligibility filter
    // the pick UI and week-locked logic below use: home OR away is SEC).
    const { data: upcomingGames } = await supabase
      .from("games")
      .select(
        `kickoff_time,
         home_team:master_teams!games_home_team_id_fkey(conference),
         away_team:master_teams!games_away_team_id_fkey(conference)`
      )
      .eq("schedule_id", currentWeek.id)
      .gt("kickoff_time", today.toISOString())
      .order("kickoff_time");
    const nextSecGame = (upcomingGames ?? []).find((g) => {
      const home = g.home_team as unknown as { conference: string };
      const away = g.away_team as unknown as { conference: string };
      return home.conference === "SEC" || away.conference === "SEC";
    });
    nextKickoff = nextSecGame?.kickoff_time ?? null;
  }

  // Personalized section — only meaningful if logged in.
  let entries: {
    id: string;
    entry_number: number;
    entry_name: string | null;
    status: string;
    eliminated_week_number: number | null;
  }[] = [];
  // entryId -> scheduleId -> cell data, for the week-by-week grid.
  const grid = new Map<string, Map<string, CellData>>();

  if (user) {
    const { data } = await supabase
      .from("survivor_entries")
      .select("id, entry_number, entry_name, status, eliminated_week_number")
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

      // Paged: the season's games already sit just under PostgREST's silent
      // 1,000-row cap, and later weeks' schedules are still being filled in.
      const games = await fetchAll<GameRow>((from, to) =>
        supabase
          .from("games")
          .select(
            `id, schedule_id, kickoff_time, status, home_score, away_score,
             home_team:master_teams!games_home_team_id_fkey(id, conference),
             away_team:master_teams!games_away_team_id_fkey(id, conference)`
          )
          .in("schedule_id", scheduleIds)
          .order("id")
          .range(from, to)
      );

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

      const weekNumberBySchedule = new Map((weeks ?? []).map((w) => [w.id, w.week_number]));

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

        const isLocked = nowMs >= earliestKickoff;
        const weekGames = (games ?? []).filter((g) => g.schedule_id === p.schedule_id);
        const outcomes = [teamOutcome(weekGames, team.id)];
        if (p.is_bonus_week && bonusTeam) outcomes.push(teamOutcome(weekGames, bonusTeam.id));
        // Bonus weeks need BOTH to win; either loss settles it immediately.
        const result: CellData["result"] = !isLocked
          ? null
          : outcomes.includes("lost")
            ? "lost"
            : outcomes.every((o) => o === "won")
              ? "won"
              : "pending";

        const entryRow = entries.find((en) => en.id === p.entry_id);
        const weekNumber = weekNumberBySchedule.get(p.schedule_id) ?? 0;
        const voided =
          entryRow?.eliminated_week_number != null && weekNumber > entryRow.eliminated_week_number;

        grid.get(p.entry_id)?.set(p.schedule_id, {
          locked: isLocked,
          result,
          voided,
          pick: {
            shortName: team.short_name || team.school_name,
            logoUrl: team.logo_url,
            color: team.primary_color,
            isBonus: p.is_bonus_week,
            bonusShortName: bonusTeam ? bonusTeam.short_name || bonusTeam.school_name : null,
            bonusLogoUrl: bonusTeam?.logo_url ?? null,
            bonusColor: bonusTeam?.primary_color ?? null,
          },
        });
      });

      // Fill in "no pick" cells for weeks with nothing recorded yet.
      entries.forEach((e) => {
        (weeks ?? []).forEach((w) => {
          if (!grid.get(e.id)?.has(w.id)) {
            grid.get(e.id)?.set(w.id, {
              locked: secAllKickedOffByWeek.get(w.id) ?? false,
              result: null,
              voided:
                e.eliminated_week_number != null && w.week_number > e.eliminated_week_number,
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
      <Suspense fallback={null}>
        <EntryCreatedModal />
      </Suspense>
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

      {params.bonus_saved === "1" && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Bonus pick confirmed{params.week ? ` for Week ${params.week}` : ""}.
        </p>
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
      {(() => {
        const totalEntries = stats?.total_entries ?? 0;
        const grossPot = totalEntries * 30;
        const payoutPot = Math.round(grossPot * 0.925);
        const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
        return (
          <div className="mb-6 rounded-lg border border-edge bg-surface p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-bold text-ink">{totalEntries}</p>
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
            <div className="mt-3 border-t border-edge pt-3 text-center">
              <p className="text-2xl font-bold text-gold-400">{usd(payoutPot)}</p>
              <p className="text-xs text-muted">
                Total pot after 7.5% admin fee
                <span className="mx-1 text-edge">&middot;</span>
                {usd(grossPot)} gross ({totalEntries} &times; $30)
              </p>
            </div>
          </div>
        );
      })()}

      {nextKickoff && (
        <div className="mb-6">
          <CountdownTimer target={nextKickoff} label="Next kickoff locks picks in" />
        </div>
      )}

      <TeamAvailabilityChart rows={(teamAvailability ?? []) as TeamAvailabilityRow[]} />

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
              {formatMonthDay(ENTRY_DEADLINE)}
            </span>
          </>
        )}
      </p>

      {/* Quick actions */}
      {user && entries.length === 0 ? (
        <div className="mb-8">
          {canCreateAnother ? (
            <>
              <p className="mb-2 text-center text-base font-semibold text-ink">
                You don&apos;t have an entry yet — create one to start picking.
              </p>
              <Link
                href="/survivor/new"
                className="mb-3 block rounded-md bg-gold-500 px-4 py-4 text-center text-base font-bold uppercase tracking-wide text-app shadow-lg shadow-gold-500/20 transition hover:bg-gold-600"
              >
                + New Entry
              </Link>
            </>
          ) : (
            <p className="mb-3 text-center text-sm text-dead">Entry deadline has passed.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/survivor/schedule"
              className="rounded-md px-3 py-2 text-center text-sm font-medium text-muted underline-offset-2 transition hover:text-ink hover:underline"
            >
              Schedule
            </Link>
            <Link
              href="/survivor/rules"
              className="rounded-md px-3 py-2 text-center text-sm font-medium text-muted underline-offset-2 transition hover:text-ink hover:underline"
            >
              Rules
            </Link>
          </div>
        </div>
      ) : (
        <div className={canCreateAnother ? "mb-8 grid grid-cols-4 gap-2" : "mb-8 grid grid-cols-3 gap-2"}>
          <Link
            href="/survivor/locked"
            className="rounded-md border border-edge px-3 py-2.5 text-center text-sm font-medium text-ink transition hover:bg-surface-hover"
          >
            View Picks
          </Link>
          <Link
            href="/survivor/schedule"
            className="rounded-md border border-edge px-3 py-2.5 text-center text-sm font-medium text-ink transition hover:bg-surface-hover"
          >
            Schedule
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
      )}

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
      ) : entries.length === 0 ? null : (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Your entries
          </h2>
          {
            // A genuinely fixed left column (outside the horizontally-scrolling
            // week grid) rather than `position: sticky` table cells — sticky
            // <td>/<th> is unreliable during horizontal scroll on mobile Safari.
            //
            // Each entry renders its OWN block: [name/status] beside ONE
            // scroller that holds both its week-label row and its pick cells.
            // The labels used to live in a separate shared scroller above all
            // entries, so swiping a row left/right never moved them and you
            // lost track of which week you were looking at. Sharing the
            // scroller makes the header travel with the cells by construction.
            (() => {
              const weekList = weeks ?? [];
              const anyEditable = entries.some(
                (en) =>
                  en.status === "active" &&
                  weekList.some((w) => {
                    const c = grid.get(en.id)?.get(w.id);
                    return c && !c.locked && !c.voided;
                  })
              );

              return (
                <div className="mb-4">
                  {anyEditable && (
                    <div className="mb-3 rounded-md border border-gold-500/60 bg-gold-500/10 px-3 py-2 text-xs text-ink">
                      <span className="font-semibold text-gold-400">To change a pick:</span> tap any
                      week with a gold outline and a &#9998; badge. You can edit it until that
                      team&apos;s game kicks off &mdash; after that the week is locked and greyed out.
                    </div>
                  )}

                  <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-sm border-2 border-gold-400" />
                      Editable
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-sm border-2 border-alive bg-app" />
                      Won
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-sm border-2 border-dead bg-app" />
                      Lost
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-3 w-3 rounded-sm border-2 border-edge bg-app" />
                      Locked / in play
                    </span>
                  </div>

                  {entries.map((entry) => (
                    <div key={entry.id} className="mb-3">
                      <div className="flex gap-3">
                        <div className="w-[110px] flex-shrink-0">
                          {/* Spacer matching the week-label row (h-5 + gap-1) so the
                              name lines up with the pick cells beside it. */}
                          <div className="mb-1 h-5" />
                          <div className="flex h-14 flex-col justify-center px-2">
                            <Link
                              href={`/survivor/${entry.id}`}
                              className="block truncate text-sm font-medium text-ink hover:text-gold-400"
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
                          </div>
                        </div>

                        <div className="no-scrollbar -mr-6 flex-1 overflow-x-auto pr-6">
                          <div className="flex w-max flex-col gap-1">
                            <div
                              className="grid gap-1"
                              style={{ gridTemplateColumns: `repeat(${weekList.length}, 56px)` }}
                            >
                              {weekList.map((w) => (
                                <div
                                  key={w.id}
                                  className={`flex h-5 items-center justify-center font-data text-xs ${
                                    w.id === currentWeek?.id
                                      ? "rounded-sm bg-gold-500/15 font-semibold text-gold-400"
                                      : "font-medium text-muted"
                                  }`}
                                >
                                  Wk{w.week_number}
                                </div>
                              ))}
                            </div>

                            <div
                              className="grid gap-1"
                              style={{ gridTemplateColumns: `repeat(${weekList.length}, 56px)` }}
                            >
                              {weekList.map((w) => {
                                const cell = grid.get(entry.id)?.get(w.id) ?? {
                                  locked: false,
                                  result: null,
                                  voided: false,
                                  pick: null,
                                };
                                const readOnly = entry.status === "eliminated";
                                const editable = !cell.locked && !cell.voided && !readOnly;
                                const base =
                                  "relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md border-2 text-center";

                                // Moot week after elimination: quiet placeholder.
                                if (cell.voided) {
                                  return (
                                    <div
                                      key={`${entry.id}-${w.id}`}
                                      className={`${base} flex items-center justify-center border-transparent`}
                                    >
                                      <span className="text-sm text-edge">&ndash;</span>
                                    </div>
                                  );
                                }

                                const bonusStyle = cell.pick?.isBonus
                                  ? {
                                      background: `linear-gradient(135deg, ${
                                        cell.pick.color || "#232B45"
                                      } 50%, ${cell.pick.bonusColor || "#3a4568"} 50%)`,
                                    }
                                  : undefined;

                                const inner = cell.pick ? (
                                  cell.pick.isBonus ? (
                                    <>
                                      {cell.pick.logoUrl && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={cell.pick.logoUrl}
                                          alt=""
                                          className="absolute left-2 top-2 h-5 w-5 object-contain drop-shadow"
                                        />
                                      )}
                                      {cell.pick.bonusLogoUrl && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={cell.pick.bonusLogoUrl}
                                          alt=""
                                          className="absolute bottom-2 right-2 h-5 w-5 object-contain drop-shadow"
                                        />
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {cell.pick.logoUrl && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={cell.pick.logoUrl}
                                          alt=""
                                          className="h-5 w-5 object-contain"
                                        />
                                      )}
                                      {cell.pick.color && (
                                        <span
                                          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                                          style={{ backgroundColor: cell.pick.color }}
                                        />
                                      )}
                                      <span
                                        className="max-w-[48px] truncate text-[10px] font-semibold text-ink"
                                        style={
                                          editable && isReadableOnDark(cell.pick.color)
                                            ? { color: cell.pick.color as string }
                                            : undefined
                                        }
                                      >
                                        {cell.pick.shortName}
                                      </span>
                                    </>
                                  )
                                ) : cell.locked || readOnly ? (
                                  <span className="text-lg leading-none text-dead">&#10005;</span>
                                ) : (
                                  <>
                                    <span className="text-lg leading-none text-gold-400">+</span>
                                    <span className="text-[10px] font-semibold uppercase text-gold-400">
                                      Pick
                                    </span>
                                  </>
                                );

                                // Border colour carries the status: gold = you can
                                // still edit it, green/red = settled result, plain
                                // edge = locked but the game isn't final yet.
                                const border = editable
                                  ? cell.pick
                                    ? "border-gold-400"
                                    : "border-dashed border-gold-400"
                                  : cell.result === "won"
                                    ? "border-alive"
                                    : cell.result === "lost"
                                      ? "border-dead"
                                      : "border-edge";

                                const badge = editable ? (
                                  <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gold-500 text-[9px] leading-none text-app shadow">
                                    &#9998;
                                  </span>
                                ) : cell.result === "won" ? (
                                  <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-alive text-[9px] font-bold leading-none text-app">
                                    &#10003;
                                  </span>
                                ) : cell.result === "lost" ? (
                                  <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-dead text-[9px] font-bold leading-none text-white">
                                    &#10005;
                                  </span>
                                ) : cell.pick ? (
                                  <span className="absolute right-0.5 top-0.5 text-[10px] leading-none">
                                    &#128274;
                                  </span>
                                ) : null;

                                const title = cell.pick?.isBonus
                                  ? `${cell.pick.shortName} + ${cell.pick.bonusShortName} (bonus)`
                                  : undefined;

                                const content = (
                                  <>
                                    <span
                                      style={bonusStyle}
                                      className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 ${
                                        editable ? "" : "opacity-60 grayscale"
                                      }`}
                                    >
                                      {inner}
                                    </span>
                                    {badge}
                                  </>
                                );

                                if (editable) {
                                  return (
                                    <Link
                                      key={`${entry.id}-${w.id}`}
                                      href={`/survivor/${entry.id}?week=${w.week_number}`}
                                      title={title ?? "Tap to change this pick"}
                                      aria-label={`${cell.pick ? "Edit" : "Make"} pick for ${
                                        entry.entry_name || `Entry ${entry.entry_number}`
                                      }, week ${w.week_number}`}
                                      className={`${base} ${border} bg-surface transition hover:ring-2 hover:ring-gold-400`}
                                    >
                                      {content}
                                    </Link>
                                  );
                                }

                                return (
                                  <div
                                    key={`${entry.id}-${w.id}`}
                                    title={title}
                                    className={`${base} ${border} bg-app`}
                                  >
                                    {content}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      <Link
                        href={`/survivor/entries/${entry.id}/bonus`}
                        className="mt-1.5 flex items-center gap-2 rounded-md border border-edge bg-surface px-3 py-2 text-sm font-medium text-gold-400 transition hover:bg-surface-hover"
                      >
                        <span aria-hidden="true">⭐</span>
                        Make a Bonus Pick for this entry
                      </Link>
                    </div>
                  ))}
                </div>
              );
            })()
          }
        </>
      )}
    </main>
  );
}
