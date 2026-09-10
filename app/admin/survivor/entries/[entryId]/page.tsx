import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEASON } from "@/lib/season";
import {
  updateEntryAdmin,
  adminSetSurvivorPick,
  adminSetSurvivorBonusPick,
  adminDeleteSurvivorPick,
} from "@/app/actions/admin-survivor";

type TeamRef = {
  id: string;
  school_name: string;
  short_name: string | null;
  conference: string;
};

type GameRow = {
  id: string;
  schedule_id: string;
  kickoff_time: string | null;
  home_team: TeamRef;
  away_team: TeamRef;
};

export default async function AdminSurvivorEntryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; cleared?: string; updated?: string }>;
}) {
  const { entryId } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const { data: entryData } = await supabase
    .from("survivor_entries")
    .select(
      `id, entry_name, entry_number, status, eliminated_week_number, user_id,
       user:profiles!survivor_entries_user_id_fkey(first_name, last_name, email)`
    )
    .eq("id", entryId)
    .maybeSingle();
  const entry = entryData as unknown as
    | {
        id: string;
        entry_name: string | null;
        entry_number: number;
        status: string;
        eliminated_week_number: number | null;
        user: { first_name: string | null; last_name: string | null; email: string | null } | null;
      }
    | null;

  if (!entry) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href="/admin/survivor/entries"
          className="mb-4 inline-block text-sm text-gold-400 hover:underline"
        >
          &larr; Entries
        </Link>
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          That entry doesn&apos;t exist.
        </p>
      </div>
    );
  }

  const { data: weeks } = await supabase
    .from("schedule")
    .select("id, week_number, label")
    .eq("season", SEASON)
    .order("week_number");
  const scheduleIds = (weeks ?? []).map((w) => w.id);

  const [{ data: pickRows }, { data: bonusRows }, { data: gamesData }] = await Promise.all([
    supabase
      .from("survivor_picks")
      .select("schedule_id, team_id, is_bonus_week, bonus_team_id")
      .eq("entry_id", entryId),
    supabase
      .from("survivor_bonus_picks")
      .select("schedule_id, team_a_id, team_b_id")
      .eq("entry_id", entryId),
    supabase
      .from("games")
      .select(
        `id, schedule_id, kickoff_time,
         home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name, conference),
         away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name, conference)`
      )
      .in("schedule_id", scheduleIds.length ? scheduleIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const games = (gamesData ?? []) as unknown as GameRow[];
  const pickByWeek = new Map((pickRows ?? []).map((p) => [p.schedule_id, p]));
  const bonusByWeek = new Map((bonusRows ?? []).map((b) => [b.schedule_id, b]));
  const bonusWeeksUsed = (bonusRows ?? []).length;

  const teamName = (t: TeamRef) => t.short_name || t.school_name;

  // Every team this entry has already used (regular or bonus), keyed to the
  // week it was used in — the DB still enforces no-reuse even for admin
  // overrides, so mark these in the selectors to avoid a confusing rejection.
  const weekNumById = new Map((weeks ?? []).map((w) => [w.id, w.week_number]));
  const usedTeamWeek = new Map<string, number>();
  (pickRows ?? []).forEach((p) => {
    const wn = weekNumById.get(p.schedule_id);
    if (wn === undefined) return;
    usedTeamWeek.set(p.team_id, wn);
    if (p.bonus_team_id) usedTeamWeek.set(p.bonus_team_id, wn);
  });

  const ownerName = [entry.user?.first_name, entry.user?.last_name].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/survivor/entries"
        className="mb-4 inline-block text-sm text-gold-400 hover:underline"
      >
        &larr; Entries
      </Link>
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        {entry.entry_name || `Entry ${entry.entry_number}`}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {ownerName || "—"} ({entry.user?.email || "no email"}) —{" "}
        {entry.status === "eliminated"
          ? `Eliminated (Wk ${entry.eliminated_week_number ?? "?"})`
          : "Alive"}{" "}
        — {bonusWeeksUsed}/2 bonus picks used
      </p>

      {query.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{query.error}</p>
      )}
      {(query.saved || query.cleared || query.updated) && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          {query.updated ? "Entry updated." : query.cleared ? "Pick cleared." : "Pick saved."}
        </p>
      )}

      <form
        action={updateEntryAdmin}
        className="mb-8 flex flex-wrap items-end gap-2 rounded-lg border border-edge bg-surface p-4"
      >
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="status" value={entry.status} />
        <input
          type="hidden"
          name="eliminatedWeekNumber"
          value={entry.eliminated_week_number ?? ""}
        />
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
            Entry name
          </label>
          <input
            type="text"
            name="entryName"
            defaultValue={entry.entry_name || ""}
            placeholder={`Entry ${entry.entry_number}`}
            className="w-full rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-gold-500 px-4 py-1.5 text-sm font-semibold text-app transition hover:bg-gold-600"
        >
          Rename
        </button>
      </form>

      <h2 className="mb-1 font-display text-lg font-semibold uppercase tracking-wide text-ink">
        Weekly picks
      </h2>
      <p className="mb-4 text-xs text-muted">
        Admin overrides bypass the kickoff lock and elimination — every week is editable. The DB
        still blocks re-using a team or exceeding 2 bonus weeks; those show as an error if you try.
      </p>

      <div className="flex flex-col gap-3">
        {(weeks ?? []).map((week) => {
          const pick = pickByWeek.get(week.id);
          const bonus = bonusByWeek.get(week.id);
          const isBonus = !!pick?.is_bonus_week || !!bonus;

          // SEC teams with a game this week — valid regular/bonus options.
          const secTeams: TeamRef[] = [];
          const seen = new Set<string>();
          games
            .filter((g) => g.schedule_id === week.id)
            .forEach((g) => {
              [g.home_team, g.away_team].forEach((t) => {
                if (t.conference === "SEC" && !seen.has(t.id)) {
                  seen.add(t.id);
                  secTeams.push(t);
                }
              });
            });
          secTeams.sort((a, b) => teamName(a).localeCompare(teamName(b)));

          const optionLabel = (t: TeamRef) => {
            const usedWk = usedTeamWeek.get(t.id);
            return usedWk !== undefined && usedWk !== week.week_number
              ? `${teamName(t)} (used Wk ${usedWk})`
              : teamName(t);
          };

          let currentLabel = "—";
          if (isBonus && bonus) {
            const a = secTeams.find((t) => t.id === bonus.team_a_id);
            const b = secTeams.find((t) => t.id === bonus.team_b_id);
            currentLabel = `${a ? teamName(a) : "?"} + ${b ? teamName(b) : "?"} (bonus)`;
          } else if (pick) {
            const t = secTeams.find((x) => x.id === pick.team_id);
            currentLabel = t ? teamName(t) : "?";
          }

          return (
            <form
              key={week.id}
              action={adminSetSurvivorPick}
              className="rounded-lg border border-edge bg-surface p-3"
            >
              <input type="hidden" name="entryId" value={entryId} />
              <input type="hidden" name="scheduleId" value={week.id} />

              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  Week {week.week_number}
                  {week.label ? <span className="ml-2 text-xs font-normal text-muted">{week.label}</span> : null}
                </span>
                <span className="text-xs text-muted">
                  Current: <span className="text-ink">{currentLabel}</span>
                </span>
              </div>

              {secTeams.length === 0 ? (
                <p className="text-xs text-muted">No SEC games scheduled this week.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-wide text-muted">Regular pick</span>
                      <select
                        name="teamId"
                        defaultValue={!isBonus && pick ? pick.team_id : ""}
                        className="rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
                      >
                        <option value="">— none —</option>
                        {secTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {optionLabel(t)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="rounded-md bg-gold-500 px-3 py-1.5 text-sm font-semibold text-app transition hover:bg-gold-600"
                    >
                      Save pick
                    </button>
                    {(pick || bonus) && (
                      <button
                        type="submit"
                        formAction={adminDeleteSurvivorPick}
                        className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-dead transition hover:bg-surface-hover"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-end gap-2 border-t border-edge pt-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-wide text-muted">
                        Bonus week — regular team
                      </span>
                      <select
                        name="teamAId"
                        defaultValue={bonus?.team_a_id ?? ""}
                        className="rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
                      >
                        <option value="">— select —</option>
                        {secTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {optionLabel(t)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-wide text-muted">Bonus team</span>
                      <select
                        name="teamBId"
                        defaultValue={bonus?.team_b_id ?? ""}
                        className="rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
                      >
                        <option value="">— select —</option>
                        {secTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {optionLabel(t)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      formAction={adminSetSurvivorBonusPick}
                      className="rounded-md border border-gold-500 px-3 py-1.5 text-sm font-semibold text-gold-400 transition hover:bg-gold-500/10"
                    >
                      Save bonus
                    </button>
                  </div>
                </div>
              )}
            </form>
          );
        })}
      </div>
    </div>
  );
}
