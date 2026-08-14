import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEASON } from "@/lib/season";

type WeekRow = { id: string; week_number: number; start_date: string; end_date: string };

type WeekState = {
  weekNumber: number;
  scheduleId: string;
  state: "used" | "unavailable" | "open";
  reason?: string;
  usedTeams?: {
    aName: string;
    aLogo: string | null;
    bName: string;
    bLogo: string | null;
  };
};

export default async function BonusWeekSelectorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id: entryId } = await params;
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

  const { data: bonusPicks } = await supabase
    .from("survivor_bonus_picks")
    .select("schedule_id, team_a_id, team_b_id")
    .eq("entry_id", entryId);

  const bonusWeeksUsed = (bonusPicks ?? []).length;

  const teamIds = new Set<string>();
  (bonusPicks ?? []).forEach((p) => {
    teamIds.add(p.team_a_id);
    teamIds.add(p.team_b_id);
  });
  const { data: teams } = teamIds.size
    ? await supabase
        .from("master_teams")
        .select("id, school_name, logo_url")
        .in("id", Array.from(teamIds))
    : { data: [] };
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const bonusPickByWeek = new Map((bonusPicks ?? []).map((p) => [p.schedule_id, p]));

  const scheduleIds = (weeks ?? []).map((w) => w.id);
  const { data: games } = await supabase
    .from("games")
    .select(
      `schedule_id, kickoff_time,
       home_team:master_teams!games_home_team_id_fkey(id, conference),
       away_team:master_teams!games_away_team_id_fkey(id, conference)`
    )
    .in("schedule_id", scheduleIds.length ? scheduleIds : ["00000000-0000-0000-0000-000000000000"]);

  const nowMs = Date.now();

  const weeksState: WeekState[] = ((weeks ?? []) as WeekRow[]).map((w) => {
    const bonusPick = bonusPickByWeek.get(w.id);

    if (bonusPick) {
      const teamA = teamById.get(bonusPick.team_a_id);
      const teamB = teamById.get(bonusPick.team_b_id);
      return {
        weekNumber: w.week_number,
        scheduleId: w.id,
        state: "used",
        usedTeams: {
          aName: teamA?.school_name ?? "Unknown",
          aLogo: teamA?.logo_url ?? null,
          bName: teamB?.school_name ?? "Unknown",
          bLogo: teamB?.logo_url ?? null,
        },
      };
    }

    const weekGames = (games ?? []).filter((g) => g.schedule_id === w.id);
    const secGames = weekGames.filter((g) => {
      const home = g.home_team as unknown as { conference: string };
      const away = g.away_team as unknown as { conference: string };
      return home.conference === "SEC" || away.conference === "SEC";
    });
    const locked =
      eliminated ||
      secGames.length === 0 ||
      secGames.every((g) => new Date(g.kickoff_time).getTime() <= nowMs);

    if (locked) {
      return {
        weekNumber: w.week_number,
        scheduleId: w.id,
        state: "unavailable",
        reason: eliminated
          ? "Entry eliminated"
          : secGames.length === 0
            ? "No SEC games this week"
            : "Week has locked",
      };
    }

    if (bonusWeeksUsed >= 2) {
      return {
        weekNumber: w.week_number,
        scheduleId: w.id,
        state: "unavailable",
        reason: "Both bonus picks already used",
      };
    }

    return { weekNumber: w.week_number, scheduleId: w.id, state: "open" };
  });

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl">
      <Link
        href="/survivor"
        className="mb-4 inline-block text-sm text-gold-400 hover:underline"
      >
        &larr; Back to pool home
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        Bonus Picks
      </h1>
      <p className="mb-2 text-sm text-muted">
        {entry.entry_name || `Entry ${entry.entry_number}`} &middot; choose 2 weeks to use a
        bonus pick. In a bonus week, you pick two teams — both must win for this entry to
        advance.
      </p>
      <p className="mb-6 font-data text-sm font-semibold text-ink">
        {bonusWeeksUsed} / 2 bonus weeks used
      </p>

      {sp.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{sp.error}</p>
      )}

      {eliminated && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">
          This entry has been eliminated and can no longer submit picks.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {weeksState.map((w) => (
          <div
            key={w.scheduleId}
            className="flex items-center justify-between gap-3 rounded-md border border-edge bg-surface px-4 py-3"
          >
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-semibold text-ink">Week {w.weekNumber}</span>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                    (w.state === "used"
                      ? "bg-gold-500/20 text-gold-400"
                      : w.state === "open"
                        ? "bg-alive/15 text-alive"
                        : "bg-edge text-muted")
                  }
                >
                  {w.state === "used" ? "Used" : w.state === "open" ? "Open" : "Unavailable"}
                </span>
              </div>
              {w.state === "used" && w.usedTeams ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span className="flex items-center gap-1">
                    {w.usedTeams.aLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.usedTeams.aLogo} alt="" className="h-4 w-4 object-contain" />
                    )}
                    {w.usedTeams.aName}
                  </span>
                  <span>+</span>
                  <span className="flex items-center gap-1">
                    {w.usedTeams.bLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.usedTeams.bLogo} alt="" className="h-4 w-4 object-contain" />
                    )}
                    {w.usedTeams.bName}
                  </span>
                </div>
              ) : w.state === "unavailable" ? (
                <p className="truncate text-sm text-muted">{w.reason}</p>
              ) : (
                <p className="truncate text-sm text-muted">Available for a bonus pick</p>
              )}
            </div>
            {w.state === "open" && (
              <Link
                href={`/survivor/entries/${entryId}/bonus/${w.weekNumber}`}
                className="flex-shrink-0 rounded-md bg-gold-500 px-3 py-2 text-xs font-semibold text-app transition hover:bg-gold-600"
              >
                Choose &rarr;
              </Link>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
