import { createClient } from "@/lib/supabase/server";
import { SEASON } from "@/lib/season";
import { isReadableOnDark } from "@/lib/color";

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
       home_team:master_teams!games_home_team_id_fkey(school_name, short_name, logo_url, primary_color, conference),
       away_team:master_teams!games_away_team_id_fkey(school_name, short_name, logo_url, primary_color, conference)`
    )
    .eq("schedule_id", currentWeek.id)
    .order("kickoff_time");

  type TeamRef = {
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

          return (
            <div
              key={g.id}
              className="flex w-40 flex-shrink-0 flex-col gap-2 rounded-lg border border-edge bg-surface p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {away.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={away.logo_url} alt="" className="h-6 w-6" />
                  )}
                  {away.primary_color && (
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: away.primary_color }}
                    />
                  )}
                  <span
                    className="text-sm font-semibold"
                    style={
                      isReadableOnDark(away.primary_color)
                        ? { color: away.primary_color as string }
                        : undefined
                    }
                  >
                    {away.short_name || away.school_name}
                  </span>
                </div>
                {isFinal && <span className="font-data text-sm text-ink">{g.away_score}</span>}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {home.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={home.logo_url} alt="" className="h-6 w-6" />
                  )}
                  {home.primary_color && (
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: home.primary_color }}
                    />
                  )}
                  <span
                    className="text-sm font-semibold"
                    style={
                      isReadableOnDark(home.primary_color)
                        ? { color: home.primary_color as string }
                        : undefined
                    }
                  >
                    {home.short_name || home.school_name}
                  </span>
                </div>
                {isFinal && <span className="font-data text-sm text-ink">{g.home_score}</span>}
              </div>
              <p className="font-data text-xs text-muted">
                {isFinal
                  ? "Final"
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
