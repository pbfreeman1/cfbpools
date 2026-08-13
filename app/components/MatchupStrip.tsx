import { createClient } from "@/lib/supabase/server";
import { SEASON } from "@/lib/season";
import { GameMatchupLine } from "@/app/components/MatchupLine";

export default async function MatchupStrip() {
  const supabase = await createClient();

  const { data: weeks } = await supabase
    .from("schedule")
    .select("id, week_number, start_date, end_date")
    .eq("season", SEASON)
    .order("week_number");

  const today = new Date();
  const currentWeek =
    (weeks ?? []).find((w) => today >= new Date(w.start_date) && today <= new Date(w.end_date)) ??
    (weeks ?? []).find((w) => new Date(w.start_date) > today);

  if (!currentWeek) return null;

  const { data: games } = await supabase
    .from("games")
    .select(
      `id, kickoff_time, status, home_score, away_score,
       home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name, logo_url, primary_color, conference),
       away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name, logo_url, primary_color, conference)`
    )
    .eq("schedule_id", currentWeek.id)
    .order("kickoff_time");

  type TeamRef = {
    id: string;
    school_name: string;
    short_name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    conference: string;
  };

  const secGames = (games ?? []).filter((g) => {
    const home = g.home_team as unknown as TeamRef;
    const away = g.away_team as unknown as TeamRef;
    return home.conference === "SEC" || away.conference === "SEC";
  });

  if (secGames.length === 0) return null;

  return (
    <div className="mb-8">
      <p className="mb-2 font-display text-xs uppercase tracking-wide text-muted">
        Week {currentWeek.week_number} &middot; SEC matchups
      </p>
      <div className="no-scrollbar -mx-6 flex gap-3 overflow-x-auto px-6 pb-2">
        {secGames.map((g) => {
          const home = g.home_team as unknown as TeamRef;
          const away = g.away_team as unknown as TeamRef;
          const kickoff = new Date(g.kickoff_time);
          const isFinal = g.status === "final";

          const homeWon = isFinal && g.home_score !== null && g.away_score !== null && g.home_score > g.away_score;
          const awayWon = isFinal && g.home_score !== null && g.away_score !== null && g.away_score > g.home_score;

          return (
            <div
              key={g.id}
              className="flex w-44 flex-shrink-0 flex-col gap-2 rounded-lg border border-edge bg-surface p-3"
            >
              <GameMatchupLine
                home={{ id: home.id, name: home.short_name || home.school_name, logo_url: home.logo_url, color: home.primary_color }}
                away={{ id: away.id, name: away.short_name || away.school_name, logo_url: away.logo_url, color: away.primary_color }}
                homeWon={homeWon}
                awayWon={awayWon}
              />
              <p className="font-data text-xs text-muted">
                {isFinal
                  ? `Final ${g.away_score}-${g.home_score}`
                  : kickoff.toLocaleString("en-US", {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
