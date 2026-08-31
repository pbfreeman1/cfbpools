import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEASON } from "@/lib/season";
import { getMatchupPrefix } from "@/app/components/MatchupLine";
import BonusTeamSelect, { type TeamOption } from "./BonusTeamSelect";

type TeamRef = {
  id: string;
  school_name: string;
  logo_url: string | null;
  conference: string;
  primary_color: string | null;
};

export default async function BonusTeamSelectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; week: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: entryId, week } = await params;
  const sp = await searchParams;
  const weekNumber = Number(week);

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
  if (entry.status === "eliminated") {
    redirect(
      `/survivor/entries/${entryId}/bonus?error=${encodeURIComponent("This entry has been eliminated and can no longer submit picks")}`
    );
  }

  const { data: scheduleRow } = await supabase
    .from("schedule")
    .select("id, week_number")
    .eq("season", SEASON)
    .eq("week_number", weekNumber)
    .single();
  if (!scheduleRow) notFound();

  // This week's existing bonus pick, if any. Rather than bouncing back to the
  // selector, we let the user edit it in place (or clear it). team_a_id is the
  // regular-pick slot, team_b_id the bonus slot (see saveBonusPick /
  // sync_survivor_bonus_pick_to_picks).
  const { data: existingBonusPick } = await supabase
    .from("survivor_bonus_picks")
    .select("team_a_id, team_b_id")
    .eq("entry_id", entryId)
    .eq("schedule_id", scheduleRow.id)
    .maybeSingle();
  const existingBonusTeamId = existingBonusPick?.team_b_id ?? null;

  // Cap check excludes THIS week's own pick — editing an existing bonus week
  // must stay possible even once both bonus slots are spent for the season.
  const { count: otherBonusWeeksUsed } = await supabase
    .from("survivor_bonus_picks")
    .select("*", { count: "exact", head: true })
    .eq("entry_id", entryId)
    .neq("schedule_id", scheduleRow.id);
  if ((otherBonusWeeksUsed ?? 0) >= 2) {
    redirect(
      `/survivor/entries/${entryId}/bonus?error=${encodeURIComponent("Both bonus picks have already been used this season")}`
    );
  }

  // Season-wide "already used" map — checked against BOTH survivor_picks
  // (regular + prior bonus picks) and survivor_bonus_picks, per the same
  // exclusion rule the main Pick Tool surfaces.
  const { data: weeks } = await supabase
    .from("schedule")
    .select("id, week_number")
    .eq("season", SEASON);
  const weekNumberBySchedule = new Map((weeks ?? []).map((w) => [w.id, w.week_number]));

  const [{ data: picks }, { data: bonusPicks }, { data: weekGames }] = await Promise.all([
    supabase.from("survivor_picks").select("schedule_id, team_id, bonus_team_id").eq("entry_id", entryId),
    supabase
      .from("survivor_bonus_picks")
      .select("schedule_id, team_a_id, team_b_id")
      .eq("entry_id", entryId),
    supabase
      .from("games")
      .select(
        `id, kickoff_time,
         home_team:master_teams!games_home_team_id_fkey(id, school_name, logo_url, conference, primary_color),
         away_team:master_teams!games_away_team_id_fkey(id, school_name, logo_url, conference, primary_color)`
      )
      .eq("schedule_id", scheduleRow.id),
  ]);

  const usedWeekByTeamId = new Map<string, number>();
  (picks ?? []).forEach((p) => {
    // The entry's current regular pick for THIS week isn't "reuse" — it's
    // what a bonus pick here would upgrade/replace.
    if (p.schedule_id === scheduleRow.id) return;
    const wn = weekNumberBySchedule.get(p.schedule_id);
    if (wn === undefined) return;
    usedWeekByTeamId.set(p.team_id, wn);
    if (p.bonus_team_id) usedWeekByTeamId.set(p.bonus_team_id, wn);
  });
  (bonusPicks ?? []).forEach((p) => {
    if (p.schedule_id === scheduleRow.id) return;
    const wn = weekNumberBySchedule.get(p.schedule_id);
    if (wn === undefined) return;
    usedWeekByTeamId.set(p.team_a_id, wn);
    usedWeekByTeamId.set(p.team_b_id, wn);
  });

  const now = Date.now();

  // team id -> display info, for the read-only summary of a locked pick.
  const teamById = new Map<string, TeamRef>();
  (weekGames ?? []).forEach((g) => {
    const home = g.home_team as unknown as TeamRef;
    const away = g.away_team as unknown as TeamRef;
    teamById.set(home.id, home);
    teamById.set(away.id, away);
  });

  // Locked once the earliest kickoff among the existing pick's two teams'
  // games has passed — the same rule validate_survivor_bonus_pick_delete /
  // validate_survivor_bonus_pick (UPDATE branch) enforce server-side.
  let locked = false;
  if (existingBonusPick) {
    const pickTeamIds = new Set([existingBonusPick.team_a_id, existingBonusPick.team_b_id]);
    const kickoffs = (weekGames ?? [])
      .filter((g) => {
        const home = g.home_team as unknown as TeamRef;
        const away = g.away_team as unknown as TeamRef;
        return pickTeamIds.has(home.id) || pickTeamIds.has(away.id);
      })
      .map((g) => new Date(g.kickoff_time).getTime())
      .filter((n) => !Number.isNaN(n));
    if (kickoffs.length > 0) locked = Math.min(...kickoffs) <= now;
  }

  const teamOptions: TeamOption[] = [];
  (weekGames ?? []).forEach((g) => {
    const home = g.home_team as unknown as TeamRef;
    const away = g.away_team as unknown as TeamRef;
    const kickoffPassed = new Date(g.kickoff_time).getTime() <= now;

    [
      { team: home, opponent: away },
      { team: away, opponent: home },
    ].forEach(({ team, opponent }) => {
      if (team.conference !== "SEC") return;

      const usedInWeek = usedWeekByTeamId.get(team.id);
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

  // The entry's existing regular-pick team for THIS week, if any. When a bonus
  // pick already exists, survivor_picks.team_id is kept in sync with
  // team_a_id, so this resolves to the bonus pick's regular slot. Its
  // name/logo come straight out of teamOptions rather than a second query,
  // since a validly-picked team must already be one of this week's SEC
  // options, and usedWeekByTeamId deliberately excludes this week's own pick
  // from the "already used" flags, so it's never disabled here.
  const currentWeekPick = (picks ?? []).find((p) => p.schedule_id === scheduleRow.id) ?? null;
  const existingRegularTeam = currentWeekPick
    ? (teamOptions.find((t) => t.id === currentWeekPick.team_id) ?? null)
    : null;

  const lockedTeamA = existingBonusPick ? (teamById.get(existingBonusPick.team_a_id) ?? null) : null;
  const lockedTeamB = existingBonusPick ? (teamById.get(existingBonusPick.team_b_id) ?? null) : null;

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl">
      <Link
        href={`/survivor/entries/${entryId}/bonus`}
        className="mb-4 inline-block text-sm text-gold-400 hover:underline"
      >
        &larr; Back to bonus weeks
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        Week {weekNumber} Bonus Pick
      </h1>
      <p className="mb-4 text-sm text-muted">
        {entry.entry_name || `Entry ${entry.entry_number}`} &middot; a bonus week needs two
        teams — your Week {weekNumber} regular pick, plus one more. Both must win for this
        entry to advance.
      </p>

      {sp.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{sp.error}</p>
      )}

      <p className="mb-4 text-xs text-muted">
        <span aria-hidden="true">🔒 FCS</span> = FCS opponent — not eligible this week.
      </p>

      {locked && existingBonusPick ? (
        <div className="rounded-md border-2 border-gold-500 p-3">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gold-400">
            Bonus pick — locked
          </p>
          <div className="flex flex-col gap-2">
            {[lockedTeamA, lockedTeamB].map((team, i) => (
              <div
                key={team?.id ?? i}
                className="flex items-center gap-2 rounded-md border border-edge bg-surface px-3 py-2.5"
              >
                {team?.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.logo_url} alt="" className="h-7 w-7 flex-shrink-0 object-contain" />
                )}
                <span className="text-sm font-semibold text-ink">
                  {team?.school_name ?? "Unknown team"}
                </span>
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {i === 0 ? "Regular" : "Bonus"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            This week has kicked off — the bonus pick can no longer be changed or cleared. Both
            teams must win for this entry to advance.
          </p>
        </div>
      ) : teamOptions.length === 0 ? (
        <p className="text-sm text-muted">No SEC games scheduled this week.</p>
      ) : (
        <BonusTeamSelect
          entryId={entryId}
          scheduleId={scheduleRow.id}
          weekNumber={weekNumber}
          teamOptions={teamOptions}
          existingRegularTeamId={existingRegularTeam?.id ?? null}
          existingBonusTeamId={existingBonusTeamId}
        />
      )}
    </main>
  );
}
