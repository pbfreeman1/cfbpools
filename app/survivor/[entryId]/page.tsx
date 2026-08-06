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

  const scheduleIds = (weeks ?? []).map((w) => w.id);
  const { data: games } = await supabase
    .from("games")
    .select(
      `id, schedule_id, kickoff_time,
       home_team:master_teams!games_home_team_id_fkey(id, school_name, logo_url, conference),
       away_team:master_teams!games_away_team_id_fkey(id, school_name, logo_url, conference)`
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

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12">
      <Link href="/survivor" className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        &larr; Back to entries
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-brand-700">
        {entry.entry_name || `Entry ${entry.entry_number}`}
      </h1>
      <p className="mb-6 text-sm text-slate-600">
        {entry.status === "eliminated" ? "Eliminated" : "Alive"} &middot; {bonusWeeksUsed}/2 bonus
        picks used
      </p>

      {sp.saved && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Pick saved.
        </p>
      )}
      {sp.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{sp.error}</p>
      )}

      <div className="flex flex-col gap-3">
        {(weeks ?? []).map((week) => {
          const pick = pickByWeek.get(week.id);

          // Teams used by this entry in any OTHER week — excluded from this
          // week's options, matching the season-long no-reuse rule.
          const usedElsewhere = new Set<string>();
          (picks ?? []).forEach((p) => {
            if (p.schedule_id === week.id) return;
            usedElsewhere.add(p.team_id);
            if (p.bonus_team_id) usedElsewhere.add(p.bonus_team_id);
          });

          const weekGames = (games ?? []).filter((g) => g.schedule_id === week.id);
          const eligibleTeams: {
            id: string;
            school_name: string;
            logo_url: string | null;
            kickoff_time: string;
          }[] = [];
          weekGames.forEach((g) => {
            // Supabase's TS types don't know these are single objects (not
            // arrays) for a to-one embed, so cast through unknown.
            const home = g.home_team as unknown as {
              id: string;
              school_name: string;
              logo_url: string | null;
              conference: string;
            };
            const away = g.away_team as unknown as {
              id: string;
              school_name: string;
              logo_url: string | null;
              conference: string;
            };
            [home, away].forEach((team) => {
              if (
                team.conference === "SEC" &&
                !usedElsewhere.has(team.id) &&
                new Date(g.kickoff_time).getTime() > now
              ) {
                eligibleTeams.push({
                  id: team.id,
                  school_name: team.school_name,
                  logo_url: team.logo_url,
                  kickoff_time: g.kickoff_time,
                });
              }
            });
          });
          eligibleTeams.sort((a, b) => a.school_name.localeCompare(b.school_name));

          // Locked if a pick exists and either of its games has kicked off,
          // or if no pick exists and there are no eligible teams left.
          let locked = false;
          if (pick) {
            const pickGames = weekGames.filter(
              (g) =>
                [
                  (g.home_team as unknown as { id: string }).id,
                  (g.away_team as unknown as { id: string }).id,
                ].includes(pick.team_id) ||
                (pick.bonus_team_id &&
                  [
                    (g.home_team as unknown as { id: string }).id,
                    (g.away_team as unknown as { id: string }).id,
                  ].includes(pick.bonus_team_id))
            );
            locked = pickGames.some((g) => new Date(g.kickoff_time).getTime() <= now);
          } else {
            locked = eligibleTeams.length === 0;
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
              eligibleTeams={eligibleTeams}
              bonusWeeksUsed={bonusWeeksUsed}
            />
          );
        })}
      </div>
    </main>
  );
}
