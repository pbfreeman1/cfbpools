import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEASON } from "@/lib/season";
import { GameMatchupLine } from "@/app/components/MatchupLine";
import WeekSelectorStrip from "@/app/components/WeekSelectorStrip";

type TeamRef = {
  id: string;
  school_name: string;
  short_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  conference: string;
};

type GameRow = {
  id: string;
  schedule_id: string;
  kickoff_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_spread: number | null;
  home_team: TeamRef;
  away_team: TeamRef;
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; conferenceOnly?: string; entry?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: weeks }, { data: secTeams }] = await Promise.all([
    supabase.from("schedule").select("id, week_number, start_date, end_date").eq("season", SEASON).order("week_number"),
    supabase.from("master_teams").select("id, school_name").eq("conference", "SEC").order("school_name"),
  ]);

  // "My picks so far" overlay — only meaningful when logged in with at least
  // one entry. Picks are looked up per-entry (a user can have 2), selectable
  // via ?entry=, defaulting to the first.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let myEntries: { id: string; entry_name: string | null; entry_number: number }[] = [];
  const myPickByScheduleId = new Map<
    string,
    { team_id: string; bonus_team_id: string | null; is_bonus_week: boolean }
  >();
  let selectedEntryId: string | null = null;

  if (user) {
    const { data } = await supabase
      .from("survivor_entries")
      .select("id, entry_name, entry_number")
      .eq("user_id", user.id)
      .order("entry_number");
    myEntries = data ?? [];

    if (myEntries.length > 0) {
      selectedEntryId =
        params.entry && myEntries.some((e) => e.id === params.entry) ? params.entry : myEntries[0].id;

      const { data: picks } = await supabase
        .from("survivor_picks")
        .select("schedule_id, team_id, bonus_team_id, is_bonus_week")
        .eq("entry_id", selectedEntryId);

      (picks ?? []).forEach((p) => {
        myPickByScheduleId.set(p.schedule_id, {
          team_id: p.team_id,
          bonus_team_id: p.bonus_team_id,
          is_bonus_week: p.is_bonus_week,
        });
      });
    }
  }

  const scheduleIds = (weeks ?? []).map((w) => w.id);
  const { data: gamesData } = scheduleIds.length
    ? await supabase
        .from("games")
        .select(
          `id, schedule_id, kickoff_time, status, home_score, away_score, home_spread,
           home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name, logo_url, primary_color, conference),
           away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name, logo_url, primary_color, conference)`
        )
        .in("schedule_id", scheduleIds)
        .order("kickoff_time")
    : { data: [] };

  const allGames = (gamesData ?? []) as unknown as GameRow[];

  // Every SEC team's games — either side of the matchup can be the SEC team.
  let secGames = allGames.filter((g) => g.home_team.conference === "SEC" || g.away_team.conference === "SEC");

  if (params.team) {
    secGames = secGames.filter((g) => g.home_team.id === params.team || g.away_team.id === params.team);
  }
  const conferenceOnly = params.conferenceOnly === "1";
  if (conferenceOnly) {
    secGames = secGames.filter((g) => g.home_team.conference === "SEC" && g.away_team.conference === "SEC");
  }

  const gamesByWeek = new Map<string, GameRow[]>();
  secGames.forEach((g) => {
    if (!gamesByWeek.has(g.schedule_id)) gamesByWeek.set(g.schedule_id, []);
    gamesByWeek.get(g.schedule_id)!.push(g);
  });

  const today = new Date();
  const currentWeekId = (weeks ?? []).find(
    (w) => today >= new Date(w.start_date) && today <= new Date(w.end_date)
  )?.id;

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl lg:max-w-5xl">
      <Link href="/survivor" className="mb-4 inline-block text-sm text-gold-400 hover:underline">
        &larr; Back to pool home
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        SEC Schedule
      </h1>
      <p className="mb-2 text-sm text-muted">
        Every SEC team&apos;s game, week by week. Games against FCS opponents aren&apos;t valid
        Survivor picks — any other FBS opponent, conference or not, is fine.
      </p>
      <p className="mb-6 text-xs text-muted">
        <span aria-hidden="true">🔒 FCS</span> = FCS opponent — not eligible this week.
      </p>

      <form action="/survivor/schedule" method="GET" className="mb-8 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Team</label>
          <select
            name="team"
            defaultValue={params.team || ""}
            className="rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
          >
            <option value="">All SEC teams</option>
            {(secTeams ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.school_name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-ink">
          <input
            type="checkbox"
            name="conferenceOnly"
            value="1"
            defaultChecked={conferenceOnly}
            className="accent-gold-500"
          />
          Conference games only
        </label>
        {myEntries.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              My picks
            </label>
            <select
              name="entry"
              defaultValue={selectedEntryId ?? ""}
              className="rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
            >
              {myEntries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.entry_name || `Entry ${e.entry_number}`}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="submit"
          className="rounded-md bg-gold-500 px-4 py-1.5 text-sm font-semibold text-app transition hover:bg-gold-600"
        >
          Apply
        </button>
        {(params.team || conferenceOnly) && (
          <Link href="/survivor/schedule" className="pb-1.5 text-sm text-muted hover:text-gold-400">
            Clear
          </Link>
        )}
      </form>

      {(weeks ?? []).some((w) => (gamesByWeek.get(w.id)?.length ?? 0) > 0) && (
        <WeekSelectorStrip
          weeks={(weeks ?? [])
            .filter((w) => (gamesByWeek.get(w.id)?.length ?? 0) > 0)
            .map((w) => ({
              weekNumber: w.week_number,
              locked: false,
              hasPick: false,
              isBonusWeek: false,
              href: `#week-${w.week_number}`,
            }))}
        />
      )}

      <div className="flex flex-col gap-6">
        {(weeks ?? []).map((week) => {
          const weekGames = gamesByWeek.get(week.id) ?? [];
          if (weekGames.length === 0) return null;
          const isCurrent = week.id === currentWeekId;

          return (
            <div key={week.id} id={`week-${week.week_number}`}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="font-display text-lg font-bold uppercase tracking-wide text-ink">
                  Week {week.week_number}
                </h2>
                {isCurrent && (
                  <span className="rounded-full bg-gold-500/20 px-2 py-0.5 text-xs font-semibold text-gold-400">
                    Current week
                  </span>
                )}
              </div>
              <div
                className={`divide-y divide-edge rounded-lg border bg-surface ${
                  isCurrent ? "border-gold-500" : "border-edge"
                }`}
              >
                {weekGames.map((g) => {
                  const isFinal = g.status === "final" && g.home_score !== null && g.away_score !== null;
                  const homeWon = isFinal && (g.home_score as number) > (g.away_score as number);
                  // Eligible against any FBS opponent — only FCS makes a
                  // game not-pickable, unrelated to the conferenceOnly
                  // filter above (that one means literally "both SEC").
                  const hasFcsOpponent = g.home_team.conference === "FCS" || g.away_team.conference === "FCS";

                  const myPick = myPickByScheduleId.get(g.schedule_id);
                  const myPickedTeamId =
                    myPick &&
                    (myPick.team_id === g.home_team.id || myPick.bonus_team_id === g.home_team.id
                      ? g.home_team.id
                      : myPick.team_id === g.away_team.id || myPick.bonus_team_id === g.away_team.id
                        ? g.away_team.id
                        : null);

                  return (
                    <div
                      key={g.id}
                      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
                        myPickedTeamId ? "bg-gold-500/5" : ""
                      }`}
                    >
                      <GameMatchupLine
                        home={{
                          id: g.home_team.id,
                          name: g.home_team.short_name || g.home_team.school_name,
                          logo_url: g.home_team.logo_url,
                          color: g.home_team.primary_color,
                        }}
                        away={{
                          id: g.away_team.id,
                          name: g.away_team.short_name || g.away_team.school_name,
                          logo_url: g.away_team.logo_url,
                          color: g.away_team.primary_color,
                        }}
                        homeWon={homeWon}
                        awayWon={isFinal && !homeWon}
                      />
                      <div className="flex flex-col items-end gap-1 text-right">
                        <span className="text-xs text-muted">
                          {new Date(g.kickoff_time).toLocaleString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        {isFinal ? (
                          <span className="font-data text-sm font-semibold text-ink">
                            {g.home_score}-{g.away_score}
                          </span>
                        ) : g.home_spread !== null ? (
                          <span className="font-data text-xs text-muted">
                            {g.home_team.short_name || g.home_team.school_name}{" "}
                            {g.home_spread > 0 ? `+${g.home_spread}` : g.home_spread}
                          </span>
                        ) : null}
                        {hasFcsOpponent && (
                          <span
                            title="FCS opponent — not eligible this week"
                            aria-label="FCS opponent — not eligible this week"
                            className="rounded bg-edge px-1.5 py-0.5 text-[10px] font-semibold text-muted"
                          >
                            🔒 FCS
                          </span>
                        )}
                        {myPickedTeamId && (
                          <span className="rounded bg-gold-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-gold-400">
                            {myPick?.is_bonus_week ? "★ Your bonus pick" : "✓ Your pick"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {secGames.length === 0 && (
          <p className="text-sm text-muted">No games match these filters.</p>
        )}
      </div>
    </main>
  );
}
