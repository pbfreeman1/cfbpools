import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import WeekPickCard from "./WeekPickCard";
import { SEASON } from "@/lib/season";

export default async function SurvivorEntryPage({
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
    .select("id, entry_name, entry_number, status")
    .eq("id", entryId)
    .single();

  // RLS means a mismatched/foreign entryId just returns no row, not an error.
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

  // Map every used team id -> the week_number it was used in, for the
  // "Already picked in Week X" label. Built from schedule_id -> week_number
  // below once we have `weeks`.
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

  type TeamRef = {
    id: string;
    school_name: string;
    logo_url: string | null;
    conference: string;
    primary_color: string | null;
  };

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12">
      <Link href="/survivor" className="mb-4 inline-block text-sm text-gold-400 hover:underline">
        &larr; Back to pool home
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        {entry.entry_name || `Entry ${entry.entry_number}`}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {entry.status === "eliminated" ? "Eliminated" : "Alive"} &middot; {bonusWeeksUsed}/2 bonus
        picks used
      </p>

      {sp.saved && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Pick saved.
        </p>
      )}
      {sp.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{sp.error}</p>
      )}

      <div className="flex flex-col gap-3">
        {(weeks ?? []).map((week) => {
          const pick = pickByWeek.get(week.id);
          const weekGames = (games ?? []).filter((g) => g.schedule_id === week.id);

          // Every SEC team playing this week, whether or not it's currently
          // selectable — used-elsewhere and kicked-off teams are still shown,
          // just greyed out with a reason, rather than disappearing.
          const teamOptions: {
            id: string;
            school_name: string;
            logo_url: string | null;
            opponent_name: string;
            primary_color: string | null;
            disabled: boolean;
            disabledReason: string | null;
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

              // A team already used by THIS week's own current pick should
              // never show as "already used" — exclude it from that check.
              const usedInWeek =
                team.id !== pick?.team_id && team.id !== pick?.bonus_team_id
                  ? usedWeekByTeamId.get(team.id)
                  : undefined;

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
                primary_color: team.primary_color,
                disabled: disabledReason !== null,
                disabledReason,
              });
            });
          });
          teamOptions.sort((a, b) => a.school_name.localeCompare(b.school_name));

          // Locked if a pick exists and either of its games has kicked off,
          // or if no pick exists and there are no selectable teams left.
          let locked = false;
          if (pick) {
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

          return (
            <WeekPickCard
              key={week.id}
              entryId={entryId}
              scheduleId={week.id}
              weekNumber={week.week_number}
              locked={locked}
              currentPick={
                pick
                  ? {
                      team_id: pick.team_id,
                      team_name: teamNameById.get(pick.team_id) ?? "Unknown",
                      is_bonus_week: pick.is_bonus_week,
                      bonus_team_id: pick.bonus_team_id,
                      bonus_team_name: pick.bonus_team_id
                        ? teamNameById.get(pick.bonus_team_id) ?? "Unknown"
                        : null,
                    }
                  : null
              }
              teamOptions={teamOptions}
              bonusWeeksUsed={bonusWeeksUsed}
            />
          );
        })}
      </div>
    </main>
  );
}
