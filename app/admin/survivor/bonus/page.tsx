import { createClient } from "@/lib/supabase/server";

type TeamRef = {
  id: string;
  school_name: string;
  short_name: string | null;
  logo_url: string | null;
};

type BonusPickRow = {
  entry_id: string;
  schedule_id: string;
  team_id: string;
  bonus_team_id: string | null;
  schedule: { week_number: number };
  team: TeamRef;
  bonus_team: TeamRef | null;
};

function TeamChip({ team, won }: { team: TeamRef; won: boolean | undefined }) {
  return (
    <span className="flex items-center gap-1.5">
      {team.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo_url} alt="" className="h-4 w-4 flex-shrink-0 object-contain" />
      )}
      <span className={`text-sm ${won === false ? "text-dead" : "text-ink"}`}>
        {team.short_name || team.school_name}
      </span>
    </span>
  );
}

function outcomeBadge(teamWon: boolean | undefined, bonusWon: boolean | undefined) {
  if (teamWon === undefined || bonusWon === undefined) {
    return <span className="rounded bg-gold-500/10 px-2 py-0.5 text-xs font-medium text-gold-400">Pending</span>;
  }
  if (teamWon && bonusWon) {
    return <span className="rounded bg-alive/10 px-2 py-0.5 text-xs font-medium text-alive">Won both</span>;
  }
  return <span className="rounded bg-dead/10 px-2 py-0.5 text-xs font-medium text-dead">Lost</span>;
}

export default async function AdminSurvivorBonusPage() {
  const supabase = await createClient();

  const [{ data: entries }, { data: bonusPicksRaw }] = await Promise.all([
    supabase
      .from("survivor_entries")
      .select(
        `id, entry_name, entry_number, status,
         user:profiles!survivor_entries_user_id_fkey(first_name, last_name)`
      )
      .order("entry_number"),
    supabase
      .from("survivor_picks")
      .select(
        `entry_id, schedule_id, team_id, bonus_team_id,
         schedule:schedule(week_number),
         team:master_teams!survivor_picks_team_id_fkey(id, school_name, short_name, logo_url),
         bonus_team:master_teams!survivor_picks_bonus_team_id_fkey(id, school_name, short_name, logo_url)`
      )
      .eq("is_bonus_week", true),
  ]);

  const bonusPicks = (bonusPicksRaw ?? []) as unknown as BonusPickRow[];
  const scheduleIds = [...new Set(bonusPicks.map((p) => p.schedule_id))];

  const { data: gamesData } =
    scheduleIds.length > 0
      ? await supabase
          .from("games")
          .select("schedule_id, status, home_score, away_score, home_team_id, away_team_id")
          .in("schedule_id", scheduleIds)
      : { data: [] };

  // (scheduleId, teamId) -> won, only for teams whose game this week is decided.
  const teamResultByWeek = new Map<string, boolean>();
  (gamesData ?? []).forEach((g) => {
    if (g.status === "final" && g.home_score !== null && g.away_score !== null && g.home_score !== g.away_score) {
      const homeWon = g.home_score > g.away_score;
      teamResultByWeek.set(`${g.schedule_id}:${g.home_team_id}`, homeWon);
      teamResultByWeek.set(`${g.schedule_id}:${g.away_team_id}`, !homeWon);
    }
  });

  const picksByEntry = new Map<string, BonusPickRow[]>();
  bonusPicks.forEach((p) => {
    if (!picksByEntry.has(p.entry_id)) picksByEntry.set(p.entry_id, []);
    picksByEntry.get(p.entry_id)!.push(p);
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        Bonus Week Usage
      </h1>
      <p className="mb-6 text-sm text-muted">
        Every entry must use its 2 bonus picks by season end — both teams must win for the entry
        to survive that week. Read-only summary.
      </p>

      <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
        {(entries ?? []).map((entry) => {
          const picks = (picksByEntry.get(entry.id) ?? []).sort(
            (a, b) => a.schedule.week_number - b.schedule.week_number
          );
          const owner = entry.user as unknown as { first_name: string | null; last_name: string | null } | null;
          const ownerName = [owner?.first_name, owner?.last_name].filter(Boolean).join(" ") || "—";
          const usedCount = picks.length;

          return (
            <div key={entry.id} className="px-4 py-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold text-ink">
                    {entry.entry_name || `Entry ${entry.entry_number}`}
                  </span>
                  <span className="ml-2 text-xs text-muted">{ownerName}</span>
                  <span
                    className={`ml-2 text-xs font-medium ${
                      entry.status === "eliminated" ? "text-dead" : "text-alive"
                    }`}
                  >
                    {entry.status === "eliminated" ? "Eliminated" : "Alive"}
                  </span>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    usedCount === 2
                      ? "bg-alive/10 text-alive"
                      : usedCount > 2
                        ? "bg-dead/10 text-dead"
                        : "bg-surface-hover text-muted"
                  }`}
                >
                  {usedCount}/2 used
                </span>
              </div>

              {picks.length === 0 ? (
                <p className="text-xs text-muted">No bonus weeks used yet.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {picks.map((p) => {
                    const teamWon = teamResultByWeek.get(`${p.schedule_id}:${p.team_id}`);
                    const bonusWon = p.bonus_team_id
                      ? teamResultByWeek.get(`${p.schedule_id}:${p.bonus_team_id}`)
                      : undefined;
                    return (
                      <div
                        key={`${entry.id}-${p.schedule_id}`}
                        className="flex flex-wrap items-center gap-3 text-sm"
                      >
                        <span className="w-14 flex-shrink-0 font-data text-xs text-muted">
                          Wk {p.schedule.week_number}
                        </span>
                        <TeamChip team={p.team} won={teamWon} />
                        <span className="text-xs text-muted">+</span>
                        {p.bonus_team ? (
                          <TeamChip team={p.bonus_team} won={bonusWon} />
                        ) : (
                          <span className="text-xs text-dead">missing bonus team</span>
                        )}
                        {outcomeBadge(teamWon, bonusWon)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {(!entries || entries.length === 0) && (
          <p className="px-4 py-3 text-sm text-muted">No entries yet.</p>
        )}
      </div>
    </div>
  );
}
