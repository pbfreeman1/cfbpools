import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMatchupPrefix } from "@/app/components/MatchupLine";
import PickTool, { type WeekData } from "./PickTool";
import { SEASON } from "@/lib/season";

export default async function SurvivorEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    cleared?: string;
    reassigned?: string;
    week?: string;
  }>;
}) {
  const { entryId } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entry } = await supabase
    .from("survivor_entries")
    .select("id, entry_name, entry_number, status")
    .eq("id", entryId)
    .single();

  // RLS means a mismatched/foreign entryId just returns no row, not an error.
  if (!entry) notFound();

  const { data: weeks } = await supabase
    .from("schedule")
    .select("id, week_number, start_date, end_date")
    .eq("season", SEASON)
    .order("week_number");

  const { data: picks } = await supabase
    .from("survivor_picks")
    .select("id, schedule_id, team_id, is_bonus_week, bonus_team_id")
    .eq("entry_id", entryId);

  const pickByWeek = new Map((picks ?? []).map((p) => [p.schedule_id, p]));
  const bonusWeeksUsed = (picks ?? []).filter((p) => p.is_bonus_week).length;

  // schedule_id -> week_number, for the "Used Week X" labels.
  const weekNumberBySchedule = new Map((weeks ?? []).map((w) => [w.id, w.week_number]));

  const scheduleIds = (weeks ?? []).map((w) => w.id);
  const { data: games } = await supabase
    .from("games")
    .select(
      `id, schedule_id, kickoff_time,
       home_team:master_teams!games_home_team_id_fkey(id, school_name, logo_url, conference, primary_color),
       away_team:master_teams!games_away_team_id_fkey(id, school_name, logo_url, conference, primary_color)`
    )
    .in("schedule_id", scheduleIds);

  // Team names for whatever's already picked, keyed by id.
  const teamIds = new Set<string>();
  (picks ?? []).forEach((p) => {
    teamIds.add(p.team_id);
    if (p.bonus_team_id) teamIds.add(p.bonus_team_id);
  });
  const { data: pickedTeams } = teamIds.size
    ? await supabase.from("master_teams").select("id, school_name").in("id", Array.from(teamIds))
    : { data: [] };
  const teamNameById = new Map((pickedTeams ?? []).map((t) => [t.id, t.school_name]));

  const now = Date.now();
  const eliminated = entry.status === "eliminated";

  type TeamRef = {
    id: string;
    school_name: string;
    logo_url: string | null;
    conference: string;
    primary_color: string | null;
  };

  // team id -> where else this entry has already used it. `locked` is derived
  // the same way the DB delete triggers derive it: earliest kickoff among the
  // source week's games involving either team on that pick. A used-but-unlocked
  // team can be reassigned to another week; a used-and-locked one can't.
  const usedByTeamId = new Map<
    string,
    { weekNumber: number; locked: boolean; isBonus: boolean }
  >();
  (picks ?? []).forEach((p) => {
    const wn = weekNumberBySchedule.get(p.schedule_id);
    if (wn === undefined) return;
    const pickTeamIds = [p.team_id, p.bonus_team_id].filter(Boolean) as string[];
    const kickoffs = (games ?? [])
      .filter((g) => g.schedule_id === p.schedule_id)
      .filter((g) => {
        const h = (g.home_team as unknown as TeamRef).id;
        const a = (g.away_team as unknown as TeamRef).id;
        return pickTeamIds.includes(h) || pickTeamIds.includes(a);
      })
      .map((g) => new Date(g.kickoff_time).getTime())
      .filter((n) => !Number.isNaN(n));
    const locked = eliminated || (kickoffs.length > 0 && Math.min(...kickoffs) <= now);
    const info = { weekNumber: wn, locked, isBonus: p.is_bonus_week };
    usedByTeamId.set(p.team_id, info);
    if (p.bonus_team_id) usedByTeamId.set(p.bonus_team_id, info);
  });

  const weeksData: WeekData[] = (weeks ?? []).map((week) => {
    const pick = pickByWeek.get(week.id);
    const weekGames = (games ?? []).filter((g) => g.schedule_id === week.id);

    // Every SEC team playing this week, whether or not it's currently
    // selectable — used-elsewhere and kicked-off teams are still shown,
    // just greyed out with a reason, rather than disappearing.
    const teamOptions: WeekData["teamOptions"] = [];

    weekGames.forEach((g) => {
      const home = g.home_team as unknown as TeamRef;
      const away = g.away_team as unknown as TeamRef;
      const kickoffPassed = new Date(g.kickoff_time).getTime() <= now;

      [
        { team: home, opponent: away },
        { team: away, opponent: home },
      ].forEach(({ team, opponent }) => {
        if (team.conference !== "SEC") return;

        // A team already used by THIS week's own current pick should
        // never show as "already used" — exclude it from that check.
        const usedElsewhere =
          team.id !== pick?.team_id && team.id !== pick?.bonus_team_id
            ? usedByTeamId.get(team.id)
            : undefined;

        // An SEC team is eligible against ANY FBS opponent (any
        // conference) — only an FCS opponent makes it ineligible.
        const ineligibleFcs = opponent.conference === "FCS";

        // Used elsewhere + that week not locked + eligible here => the team
        // can be reassigned to this week (confirmation modal in PickTool).
        const reassignable =
          usedElsewhere !== undefined && !usedElsewhere.locked && !ineligibleFcs && !kickoffPassed;

        let disabledReason: string | null = null;
        if (usedElsewhere !== undefined) {
          disabledReason = usedElsewhere.locked
            ? `Used Week ${usedElsewhere.weekNumber} (locked)`
            : `Used Week ${usedElsewhere.weekNumber} — tap to reassign`;
        } else if (kickoffPassed) {
          disabledReason = "Game already started";
        }

        teamOptions.push({
          id: team.id,
          school_name: team.school_name,
          logo_url: team.logo_url,
          opponent_name: opponent.school_name,
          opponent_logo_url: opponent.logo_url,
          prefix: getMatchupPrefix(team.id, home.id),
          primary_color: team.primary_color,
          kickoff_time: g.kickoff_time ?? null,
          disabled: (disabledReason !== null && !reassignable) || ineligibleFcs,
          disabledReason,
          ineligibleFcs,
          reassignable,
          reassignFrom: reassignable
            ? { weekNumber: usedElsewhere!.weekNumber, isBonus: usedElsewhere!.isBonus }
            : null,
        });
      });
    });

    // Kickoff time ascending — undetermined (null) kickoffs sort last.
    teamOptions.sort((a, b) => {
      if (a.kickoff_time === null && b.kickoff_time === null) return 0;
      if (a.kickoff_time === null) return 1;
      if (b.kickoff_time === null) return -1;
      return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime();
    });

    // Locked if a pick exists and either of its games has kicked off,
    // or if no pick exists and there are no selectable teams left.
    // An eliminated entry is always locked, regardless of kickoff state.
    let locked: boolean;
    if (eliminated) {
      locked = true;
    } else if (pick) {
      const pickGames = weekGames.filter(
        (g) =>
          [
            (g.home_team as unknown as TeamRef).id,
            (g.away_team as unknown as TeamRef).id,
          ].includes(pick.team_id) ||
          (pick.bonus_team_id &&
            [
              (g.home_team as unknown as TeamRef).id,
              (g.away_team as unknown as TeamRef).id,
            ].includes(pick.bonus_team_id))
      );
      locked = pickGames.some((g) => new Date(g.kickoff_time).getTime() <= now);
    } else {
      locked = teamOptions.every((t) => t.disabled);
    }

    return {
      weekNumber: week.week_number,
      scheduleId: week.id,
      startDate: week.start_date,
      endDate: week.end_date,
      locked,
      currentPick: pick
        ? {
            team_id: pick.team_id,
            team_name: teamNameById.get(pick.team_id) ?? "Unknown",
            is_bonus_week: pick.is_bonus_week,
            bonus_team_id: pick.bonus_team_id,
            bonus_team_name: pick.bonus_team_id ? teamNameById.get(pick.bonus_team_id) ?? "Unknown" : null,
          }
        : null,
      teamOptions,
    };
  });

  // Default landing week: whichever week we're currently inside of, else
  // the next upcoming one, else the last week of the season.
  const today = new Date();
  const currentWeek =
    weeksData.find((w) => today >= new Date(w.startDate) && today <= new Date(w.endDate)) ??
    weeksData.find((w) => new Date(w.startDate) > today) ??
    weeksData[weeksData.length - 1];

  const requestedWeek = sp.week ? weeksData.find((w) => w.weekNumber === Number(sp.week)) : undefined;
  const initialWeekNumber = (requestedWeek ?? currentWeek)?.weekNumber ?? 1;

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl lg:max-w-5xl">
      <Link href="/survivor" className="mb-4 inline-block text-sm text-gold-400 hover:underline">
        &larr; Back to pool home
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        {entry.entry_name || `Entry ${entry.entry_number}`}
      </h1>
      <p className="mb-4 text-sm text-muted">
        {entry.status === "eliminated" ? "Eliminated" : "Alive"} &middot; {bonusWeeksUsed}/2 bonus
        picks used
      </p>

      <Link
        href={`/survivor/entries/${entryId}/bonus`}
        className="mb-6 block rounded-md border border-gold-500 px-4 py-2.5 text-center text-sm font-semibold text-gold-400 transition hover:bg-gold-500/10"
      >
        Manage Bonus Picks
      </Link>

      {eliminated && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">
          This entry has been eliminated and can no longer submit picks.
        </p>
      )}

      {sp.saved && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Pick saved.
        </p>
      )}
      {sp.cleared && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Pick cleared — this week is open again.
        </p>
      )}
      {sp.reassigned && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Team reassigned to this week. The week it came from is now open — make a new pick
          there if you want one.
        </p>
      )}
      {sp.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{sp.error}</p>
      )}

      <p className="mb-4 text-xs text-muted">
        <span aria-hidden="true">🔒 FCS</span> = FCS opponent — not eligible this week.
      </p>

      <PickTool
        entryId={entryId}
        weeksData={weeksData}
        initialWeekNumber={initialWeekNumber}
        eliminated={eliminated}
      />
    </main>
  );
}
