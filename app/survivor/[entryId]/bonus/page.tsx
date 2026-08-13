import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEASON } from "@/lib/season";
import BonusPickEditor from "./BonusPickEditor";
import RemoveBonusButton from "./RemoveBonusButton";

export default async function BonusPicksPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
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
    .select("id, entry_name, entry_number")
    .eq("id", entryId)
    .single();
  if (!entry) notFound();

  const { data: weeks } = await supabase
    .from("schedule")
    .select("id, week_number")
    .eq("season", SEASON)
    .order("week_number");

  const { data: picks } = await supabase
    .from("survivor_picks")
    .select("id, schedule_id, team_id, is_bonus_week, bonus_team_id")
    .eq("entry_id", entryId);

  const pickByWeek = new Map((picks ?? []).map((p) => [p.schedule_id, p]));
  const bonusWeeksUsed = (picks ?? []).filter((p) => p.is_bonus_week).length;

  const scheduleIds = (weeks ?? []).map((w) => w.id);
  const { data: games } = await supabase
    .from("games")
    .select(
      `id, schedule_id, kickoff_time,
       home_team:master_teams!games_home_team_id_fkey(id, school_name, logo_url, conference),
       away_team:master_teams!games_away_team_id_fkey(id, school_name, logo_url, conference)`
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
  type TeamRef = { id: string; school_name: string; logo_url: string | null; conference: string };

  const currentBonusWeeks: {
    weekNumber: number;
    scheduleId: string;
    teamId: string;
    teamName: string;
    teamLogo: string | null;
    bonusTeamName: string;
    bonusTeamLogo: string | null;
    locked: boolean;
  }[] = [];

  const candidateWeeks: {
    weekNumber: number;
    scheduleId: string;
    defaultTeamId?: string;
    teamOptions: { id: string; school_name: string; logo_url: string | null; opponent_name: string }[];
  }[] = [];

  (weeks ?? []).forEach((week) => {
    const pick = pickByWeek.get(week.id);
    const weekGames = (games ?? []).filter((g) => g.schedule_id === week.id);

    const usedElsewhere = new Set<string>();
    (picks ?? []).forEach((p) => {
      if (p.schedule_id === week.id) return;
      usedElsewhere.add(p.team_id);
      if (p.bonus_team_id) usedElsewhere.add(p.bonus_team_id);
    });

    // Locked if there's a pick and its earliest relevant game has kicked
    // off, or (no pick) if no eligible teams remain.
    let locked: boolean;
    if (pick) {
      const relevant = weekGames.filter((g) => {
        const ids = [
          (g.home_team as unknown as TeamRef).id,
          (g.away_team as unknown as TeamRef).id,
        ];
        return (
          ids.includes(pick.team_id) || (pick.bonus_team_id && ids.includes(pick.bonus_team_id))
        );
      });
      locked = relevant.some((g) => new Date(g.kickoff_time).getTime() <= now);
    } else {
      const anyEligible = weekGames.some((g) => {
        const home = g.home_team as unknown as TeamRef;
        const away = g.away_team as unknown as TeamRef;
        if (home.conference !== "SEC" || away.conference !== "SEC") return false;
        const secTeamIds = [home.id, away.id];
        return (
          secTeamIds.some((id) => !usedElsewhere.has(id)) &&
          new Date(g.kickoff_time).getTime() > now
        );
      });
      locked = !anyEligible;
    }

    if (pick?.is_bonus_week) {
      const team = teamById.get(pick.team_id);
      const bonusTeam = pick.bonus_team_id ? teamById.get(pick.bonus_team_id) : null;
      currentBonusWeeks.push({
        weekNumber: week.week_number,
        scheduleId: week.id,
        teamId: pick.team_id,
        teamName: team?.school_name ?? "Unknown",
        teamLogo: team?.logo_url ?? null,
        bonusTeamName: bonusTeam?.school_name ?? "Unknown",
        bonusTeamLogo: bonusTeam?.logo_url ?? null,
        locked,
      });
      return;
    }

    if (locked) return; // not a candidate — can't change a locked week

    const teamOptions: {
      id: string;
      school_name: string;
      logo_url: string | null;
      opponent_name: string;
    }[] = [];
    weekGames.forEach((g) => {
      const home = g.home_team as unknown as TeamRef;
      const away = g.away_team as unknown as TeamRef;
      const kickoffPassed = new Date(g.kickoff_time).getTime() <= now;
      [
        { team: home, opponent: away },
        { team: away, opponent: home },
      ].forEach(({ team, opponent }) => {
        if (team.conference !== "SEC") return;
        if (opponent.conference !== "SEC") return;
        if (kickoffPassed) return;
        // A team already used by THIS week's own current pick is still a
        // valid option (it's not "elsewhere"); anything used in another
        // week is excluded.
        if (usedElsewhere.has(team.id) && team.id !== pick?.team_id) return;
        teamOptions.push({
          id: team.id,
          school_name: team.school_name,
          logo_url: team.logo_url,
          opponent_name: opponent.school_name,
        });
      });
    });
    teamOptions.sort((a, b) => a.school_name.localeCompare(b.school_name));

    if (teamOptions.length === 0) return;

    candidateWeeks.push({
      weekNumber: week.week_number,
      scheduleId: week.id,
      defaultTeamId: pick?.team_id,
      teamOptions,
    });
  });

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

      {sp.saved && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Bonus pick saved.
        </p>
      )}
      {sp.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{sp.error}</p>
      )}

      {currentBonusWeeks.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Your bonus weeks
          </h2>
          <div className="flex flex-col gap-3">
            {currentBonusWeeks.map((w) => (
              <div
                key={w.scheduleId}
                className="rounded-md border border-gold-500 bg-gold-500/5 px-4 py-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold text-ink">Week {w.weekNumber}</span>
                  {!w.locked && (
                    <RemoveBonusButton
                      entryId={entryId}
                      scheduleId={w.scheduleId}
                      keepTeamId={w.teamId}
                    />
                  )}
                  {w.locked && (
                    <span className="rounded-full bg-edge px-2 py-0.5 text-xs font-medium text-muted">
                      Locked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-ink">
                  <span className="flex items-center gap-1.5">
                    {w.teamLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.teamLogo} alt="" className="h-5 w-5 object-contain" />
                    )}
                    {w.teamName}
                  </span>
                  <span className="text-muted">+</span>
                  <span className="flex items-center gap-1.5">
                    {w.bonusTeamLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.bonusTeamLogo} alt="" className="h-5 w-5 object-contain" />
                    )}
                    {w.bonusTeamName}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {bonusWeeksUsed < 2 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Add a bonus week
          </h2>
          {candidateWeeks.length === 0 ? (
            <p className="text-sm text-muted">No open weeks left to add a bonus pick.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {candidateWeeks.map((w) => (
                <BonusPickEditor
                  key={w.scheduleId}
                  entryId={entryId}
                  scheduleId={w.scheduleId}
                  weekNumber={w.weekNumber}
                  teamOptions={w.teamOptions}
                  defaultTeamId={w.defaultTeamId}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
