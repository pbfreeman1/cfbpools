import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPickemLeaderboard, getLastPickemSyncTime } from "@/app/actions/pickem";
import LeaderboardTable from "./LeaderboardTable";
import type { PickemGameStatus } from "./GamesPanel";

type GameRow = {
  id: string;
  kickoff_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_spread: number | null;
  pickem_spread_override: number | null;
  home_team: { id: string; school_name: string; short_name: string | null; logo_url: string | null };
  away_team: { id: string; school_name: string; short_name: string | null; logo_url: string | null };
};

export default async function PickemLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ schedule_id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("current_week_id")
    .single();

  const scheduleId = params.schedule_id || appSettings?.current_week_id || "";

  if (!scheduleId) {
    return (
      <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl">
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          Season schedule not yet loaded.
        </p>
      </main>
    );
  }

  const [{ data: week }, rows, lastSync, { data: gamesData }] = await Promise.all([
    supabase.from("schedule").select("week_number, label").eq("id", scheduleId).single(),
    getPickemLeaderboard(scheduleId),
    getLastPickemSyncTime(),
    supabase
      .from("games")
      .select(
        `id, kickoff_time, status, home_score, away_score, home_spread, pickem_spread_override,
         home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name, logo_url),
         away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name, logo_url)`
      )
      .eq("schedule_id", scheduleId)
      .eq("pickem_selected", true)
      .order("kickoff_time"),
  ]);

  // A failed fetch on first load has nothing to fall back to — empty is a
  // reasonable default for a page that hasn't successfully loaded anything
  // yet. The polling path in LeaderboardTable is where a failure actually
  // matters, since there it would otherwise clobber already-good data.
  const initialRows = rows ?? [];

  const games: PickemGameStatus[] = ((gamesData ?? []) as unknown as GameRow[]).map((g) => ({
    id: g.id,
    kickoffTime: g.kickoff_time,
    status: g.status,
    effectiveSpread: g.pickem_spread_override ?? g.home_spread,
    homeScore: g.home_score,
    awayScore: g.away_score,
    homeTeam: {
      id: g.home_team.id,
      name: g.home_team.short_name || g.home_team.school_name,
      logoUrl: g.home_team.logo_url,
    },
    awayTeam: {
      id: g.away_team.id,
      name: g.away_team.short_name || g.away_team.school_name,
      logoUrl: g.away_team.logo_url,
    },
  }));

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl">
      <Link href="/pickem" className="mb-4 inline-block text-sm text-pickem-400 hover:underline">
        &larr; Pick&apos;em
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-pickem-400">
        Leaderboard
      </h1>
      <p className="mb-6 text-sm text-muted">
        {week ? `Week ${week.week_number}${week.label ? ` — ${week.label}` : ""}` : ""}
      </p>

      <LeaderboardTable
        scheduleId={scheduleId}
        initialRows={initialRows}
        initialLastSync={lastSync}
        games={games}
      />
    </main>
  );
}
