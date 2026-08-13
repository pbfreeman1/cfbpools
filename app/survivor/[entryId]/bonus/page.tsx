import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEASON } from "@/lib/season";
import { getMatchupPrefix } from "@/app/components/MatchupLine";
import BonusPickTool, { type BonusWeekData } from "./BonusPickTool";

export default async function BonusPicksPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; week?: string }>;
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
  if (!entry) notFound();
  const eliminated = entry.status === "eliminated";

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

  // Map every used team id -> the week_number it was used in, for the
  // "Already picked in Week X" label — same season-wide reuse rule the main
  // pick tool surfaces, just relevant here for both team slots.
  const weekNumberBySchedule = new Map((weeks ?? []).map((w) => [w.id, w.week_number]));
  const usedWeekByTeamId = new Map<string, number>();
  (picks ?? []).forEach((p) => {
    const wn = weekNumberBySchedule.get(p.schedule_id);
    if (wn === undefined) return;
    usedWeekByTeamId.set(p.team_id, wn);
    if (p.bonus_team_id) usedWeekByTeamId.set(p.bonus_team_id, wn);
  });

  const scheduleIds = (weeks ?? []).map((w) => w.id);
  const { data: games } = await supabase
    .from("games")
    .select(
      `id, schedule_id, kickoff_time,
       home_team:master_teams!games_home_team_id_fkey(id, school_name, logo_url, conference, primary_color),
       away_team:master_teams!games_away_team_id_fkey(id, school_name, logo_url, conference, primary_color)`
    )
    .in("schedule_id", scheduleIds);

  const teamIds = new Set<string>();
  (picks ?? []).forEach((p) => {
    teamIds.add(p.team_id);
    if (p.bonus_team_id) teamIds.add(p.bonus_team_id);
  });
  const { data: pickedTeams } = teamIds.size
    ? await supabase
        .from("master_teams")
        .select("id, school_name, logo_url")
        .in("id", Array.from(teamIds))
    : { data: [] };
  const teamById = new Map((pickedTeams ?? []).map((t) => [t.id, t]));

  const now = Date.now();
  type TeamRef = {
    id: string;
    school_name: string;
    logo_url: string | null;
    conference: string;
    primary_color: string | null;
  };

  const weeksData: BonusWeekData[] = (weeks ?? []).map((week) => {
    const pick = pickByWeek.get(week.id);
    const weekGames = (games ?? []).filter((g) => g.schedule_id === week.id);

    const teamOptions: BonusWeekData["teamOptions"] = [];
    weekGames.forEach((g) => {
      const home = g.home_team as unknown as TeamRef;
      const away = g.away_team as unknown as TeamRef;
      const kickoffPassed = new Date(g.kickoff_time).getTime() <= now;

      [
        { team: home, opponent: away },
        { team: away, opponent: home },
      ].forEach(({ team, opponent }) => {
        if (team.conference !== "SEC") return;

        // This week's own current pick (either slot) should never show as
        // "already used" against itself.
        const usedInWeek =
          team.id !== pick?.team_id && team.id !== pick?.bonus_team_id
            ? usedWeekByTeamId.get(team.id)
            : undefined;

        const ineligibleFcs = opponent.conference === "FCS";

        let disabledReason: string | null = null;
        if (usedInWeek !== undefined) {
          disabledReason = `Already picked — Week ${usedInWeek}`;
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
          disabled: disabledReason !== null || ineligibleFcs,
          disabledReason,
          ineligibleFcs,
        });
      });
    });

    teamOptions.sort((a, b) => {
      if (a.kickoff_time === null && b.kickoff_time === null) return 0;
      if (a.kickoff_time === null) return 1;
      if (b.kickoff_time === null) return -1;
      return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime();
    });

    // Same locked derivation as the main pick tool: a pick with a kicked-off
    // game, or (no pick) no selectable teams left. Eliminated entries are
    // always locked.
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

    const team = pick ? teamById.get(pick.team_id) : undefined;
    const bonusTeam = pick?.bonus_team_id ? teamById.get(pick.bonus_team_id) : undefined;

    // Can this week accept a new/edited bonus pick? Either it's already a
    // bonus week (editable up until lock), or the entry hasn't used both of
    // its season bonus weeks yet.
    const canOfferBonus = !locked && (Boolean(pick?.is_bonus_week) || bonusWeeksUsed < 2);

    return {
      weekNumber: week.week_number,
      scheduleId: week.id,
      locked,
      canOfferBonus,
      currentPick: pick
        ? {
            team_id: pick.team_id,
            team_name: team?.school_name ?? "Unknown",
            team_logo: team?.logo_url ?? null,
            is_bonus_week: pick.is_bonus_week,
            bonus_team_id: pick.bonus_team_id,
            bonus_team_name: pick.bonus_team_id ? bonusTeam?.school_name ?? "Unknown" : null,
            bonus_team_logo: pick.bonus_team_id ? bonusTeam?.logo_url ?? null : null,
          }
        : null,
      teamOptions,
    };
  });

  const today = new Date();
  const currentWeek =
    (weeks ?? []).find((w) => today >= new Date(w.start_date) && today <= new Date(w.end_date)) ??
    (weeks ?? []).find((w) => new Date(w.start_date) > today) ??
    (weeks ?? [])[(weeks ?? []).length - 1];

  const requestedWeek = sp.week ? weeksData.find((w) => w.weekNumber === Number(sp.week)) : undefined;
  const initialWeekNumber = (requestedWeek ?? weeksData.find((w) => w.weekNumber === currentWeek?.week_number))
    ?.weekNumber ?? 1;

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl lg:max-w-5xl">
      <Link
        href={`/survivor/${entryId}`}
        className="mb-4 inline-block text-sm text-gold-400 hover:underline"
      >
        &larr; Back to {entry.entry_name || `Entry ${entry.entry_number}`}
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        Bonus Picks
      </h1>
      <p className="mb-2 text-sm text-muted">
        Choose 2 weeks to use a bonus pick. In a bonus week, you pick two teams — both must win
        for this entry to advance.
      </p>
      <p className="mb-6 font-data text-sm font-semibold text-ink">
        {bonusWeeksUsed} / 2 bonus weeks used
      </p>

      {eliminated && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">
          This entry has been eliminated and can no longer submit picks.
        </p>
      )}

      {sp.saved && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Bonus pick saved.
        </p>
      )}
      {sp.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{sp.error}</p>
      )}

      <p className="mb-4 text-xs text-muted">
        <span aria-hidden="true">🔒 FCS</span> = FCS opponent — not eligible this week.
      </p>

      <BonusPickTool
        entryId={entryId}
        weeksData={weeksData}
        initialWeekNumber={initialWeekNumber}
        eliminated={eliminated}
        bonusWeeksUsed={bonusWeeksUsed}
      />
    </main>
  );
}
