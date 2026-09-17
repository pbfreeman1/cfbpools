import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatKickoff } from "@/lib/formatDate";
import DeletePickemEntryButton from "../entries/DeletePickemEntryButton";

const SELF_PATH = "/admin/pickem/admin-entries";

type TeamRef = { id: string; school_name: string; short_name: string | null };
type EntryOwner = { first_name: string | null; last_name: string | null; email: string | null };

type EntryRow = {
  id: string;
  entry_name: string;
  entrant_email: string;
  schedule_id: string;
  rownum: number | null;
  created_at: string;
  user: EntryOwner | null;
};

type RecordRow = {
  entry_id: string;
  wins: number;
  losses: number;
  pushes: number;
  effective_losses: number;
  pending: number;
};

type PickRow = {
  id: string;
  entry_id: string;
  game_id: string;
  team_id: string;
  result: string | null;
  is_final: boolean;
};

type GameRow = {
  id: string;
  kickoff_time: string;
  home_team: TeamRef;
  away_team: TeamRef;
};

function resultBadge(result: string | null) {
  if (!result) return { label: "Pending", className: "bg-surface-hover text-muted" };
  if (result === "win") return { label: "Win", className: "bg-alive/10 text-alive" };
  if (result === "loss") return { label: "Loss", className: "bg-dead/10 text-dead" };
  return { label: "Push", className: "bg-gold-500/10 text-gold-400" };
}

// This page shows entries excluded from the eCount/pot — typically admin
// or staff test accounts — across every week they've entered, not just the
// current one. That's the one thing /admin/pickem/entries doesn't do (it's
// scoped to a single schedule_id at a time). Editing a pick or deleting an
// entry reuses the exact same admin-override actions that page already
// uses; this page only adds the cross-week exclusion-filtered view on top.
export default async function AdminPickemAdminEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string; schedule_id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: activeEmailRows }, { data: appSettings }, { data: allWeeks }] = await Promise.all([
    supabase.from("pickem_admin_emails").select("email").eq("active", true),
    supabase.from("app_settings").select("current_week_id").single(),
    supabase
      .from("schedule")
      .select("id, season, week_number, label")
      .order("season", { ascending: false })
      .order("week_number", { ascending: false }),
  ]);

  // Same match rule as prepare_pickem_entry(): lower(email) equality against
  // the active exclusion list — not is_ecount_eligible, since that flag also
  // factors in rownum exclusions (a separate, unrelated exclusion mechanism)
  // and is frozen at insert time rather than recomputed live.
  const excludedEmails = new Set((activeEmailRows ?? []).map((r) => r.email.toLowerCase()));
  const weekById = new Map((allWeeks ?? []).map((w) => [w.id, w]));

  // "all" shows every week (the original cross-week view); an explicit
  // ?schedule_id= wins, otherwise default to the current week rather than
  // dumping every excluded entry from the whole season on first load.
  const selectedWeek = params.schedule_id || appSettings?.current_week_id || "all";

  if (excludedEmails.size === 0) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader />
        <p className="text-sm text-muted">
          No active email exclusions are configured — see{" "}
          <Link href="/admin/pickem/exclusions" className="text-gold-400 hover:underline">
            Exclusions
          </Link>
          .
        </p>
      </div>
    );
  }

  const { data: allEntries } = await supabase.from("pickem_entries").select(
    `id, entry_name, entrant_email, schedule_id, rownum, created_at,
     user:profiles!pickem_entries_user_id_fkey(first_name, last_name, email)`
  );
  const entries = ((allEntries ?? []) as unknown as EntryRow[]).filter(
    (e) =>
      excludedEmails.has(e.entrant_email.toLowerCase()) &&
      (selectedWeek === "all" || e.schedule_id === selectedWeek)
  );

  const entryIds = entries.map((e) => e.id);

  const [{ data: recordRows }, { data: pickRows }] = await Promise.all([
    entryIds.length
      ? supabase
          .from("pickem_entry_records")
          .select("entry_id, wins, losses, pushes, effective_losses, pending")
          .in("entry_id", entryIds)
      : Promise.resolve({ data: [] as RecordRow[] }),
    entryIds.length
      ? supabase
          .from("pickem_picks")
          .select("id, entry_id, game_id, team_id, result, is_final")
          .in("entry_id", entryIds)
      : Promise.resolve({ data: [] as PickRow[] }),
  ]);

  const recordByEntry = new Map((recordRows ?? []).map((r) => [r.entry_id, r]));

  const gameIds = [...new Set((pickRows ?? []).map((p) => p.game_id))];
  const { data: gamesData } = gameIds.length
    ? await supabase
        .from("games")
        .select(
          `id, kickoff_time,
           home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name),
           away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name)`
        )
        .in("id", gameIds)
    : { data: [] as GameRow[] };
  const gameById = new Map(((gamesData ?? []) as unknown as GameRow[]).map((g) => [g.id, g]));

  const picksByEntry = new Map<string, PickRow[]>();
  (pickRows ?? []).forEach((p) => {
    const arr = picksByEntry.get(p.entry_id) ?? [];
    arr.push(p);
    picksByEntry.set(p.entry_id, arr);
  });

  // Group by entrant email, then sort each entrant's entries newest-week-first.
  const entriesByEmail = new Map<string, EntryRow[]>();
  entries.forEach((e) => {
    const key = e.entrant_email.toLowerCase();
    const arr = entriesByEmail.get(key) ?? [];
    arr.push(e);
    entriesByEmail.set(key, arr);
  });
  entriesByEmail.forEach((arr) =>
    arr.sort((a, b) => {
      const wa = weekById.get(a.schedule_id);
      const wb = weekById.get(b.schedule_id);
      if (!wa || !wb) return 0;
      return wb.season - wa.season || wb.week_number - wa.week_number;
    })
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader />
      <p className="mb-4 text-sm text-muted">
        {entries.length} {entries.length === 1 ? "entry" : "entries"} across{" "}
        {entriesByEmail.size} excluded {entriesByEmail.size === 1 ? "address" : "addresses"}
        {selectedWeek !== "all" && weekById.get(selectedWeek)
          ? ` — Week ${weekById.get(selectedWeek)!.week_number}${
              weekById.get(selectedWeek)!.label ? ` (${weekById.get(selectedWeek)!.label})` : ""
            }`
          : " — all weeks"}
        .
      </p>

      <form action={SELF_PATH} method="GET" className="mb-6 flex flex-wrap items-center gap-2">
        <select
          name="schedule_id"
          defaultValue={selectedWeek}
          className="rounded-md border border-edge bg-app px-3 py-1.5 text-sm text-ink"
        >
          <option value="all">All weeks</option>
          {(allWeeks ?? []).map((w) => (
            <option key={w.id} value={w.id}>
              {w.season} — Week {w.week_number}
              {w.id === appSettings?.current_week_id ? " (current)" : ""}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
        >
          Go
        </button>
      </form>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}
      {params.deleted && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">Entry deleted.</p>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted">No entries from an excluded email for this filter.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {[...entriesByEmail.entries()].map(([email, entryGroup]) => {
            const owner = entryGroup[0]?.user;
            const ownerName = [owner?.first_name, owner?.last_name].filter(Boolean).join(" ");
            return (
              <section key={email}>
                <h2 className="mb-3 font-display text-base font-semibold uppercase tracking-wide text-gold-400">
                  {email}
                  {ownerName && <span className="ml-2 text-xs font-normal text-muted">({ownerName})</span>}
                </h2>
                <div className="flex flex-col gap-3">
                  {entryGroup.map((entry) => {
                    const week = weekById.get(entry.schedule_id);
                    const record = recordByEntry.get(entry.id);
                    const picks = picksByEntry.get(entry.id) ?? [];
                    return (
                      <div key={entry.id} className="rounded-lg border border-edge bg-surface p-4">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-ink">
                              {entry.entry_name}{" "}
                              <span className="font-normal text-muted">
                                — Week {week?.week_number ?? "?"}
                                {week?.label ? ` (${week.label})` : ""}
                              </span>
                            </p>
                            <p className="text-xs text-muted">
                              Row #{entry.rownum ?? "—"} — Entered {formatKickoff(entry.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {record && (
                              <span className="font-data text-xs text-muted">
                                {record.wins}-{record.effective_losses}
                                {record.pushes > 0 ? ` (${record.pushes} push)` : ""}
                                {record.pending > 0 ? ` — ${record.pending} pending` : ""}
                              </span>
                            )}
                            <Link
                              href={`/admin/pickem/entries/${entry.id}?schedule_id=${entry.schedule_id}`}
                              className="text-xs font-medium text-gold-400 hover:underline"
                            >
                              Edit picks
                            </Link>
                            <DeletePickemEntryButton
                              entryId={entry.id}
                              label={entry.entry_name}
                              redirectTo={`${SELF_PATH}?schedule_id=${selectedWeek}`}
                            />
                          </div>
                        </div>

                        {picks.length === 0 ? (
                          <p className="text-xs text-muted">No picks made.</p>
                        ) : (
                          <ul className="divide-y divide-edge">
                            {picks.map((p) => {
                              const game = gameById.get(p.game_id);
                              const pickedTeamName = game
                                ? p.team_id === game.home_team.id
                                  ? game.home_team.short_name || game.home_team.school_name
                                  : p.team_id === game.away_team.id
                                    ? game.away_team.short_name || game.away_team.school_name
                                    : "Unknown team"
                                : "Unknown team";
                              const matchup = game
                                ? `${game.away_team.short_name || game.away_team.school_name} @ ${
                                    game.home_team.short_name || game.home_team.school_name
                                  }`
                                : "Unknown game";
                              const badge = resultBadge(p.result);
                              return (
                                <li
                                  key={p.id}
                                  className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm"
                                >
                                  <span className="text-muted">{matchup}</span>
                                  <span className="flex items-center gap-2">
                                    <span className="font-medium text-ink">{pickedTeamName}</span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div className="mb-1 flex items-center justify-between">
      <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        Pick&apos;em — Admin Entries
      </h1>
      <Link href="/admin/pickem" className="text-xs text-gold-400 hover:underline">
        &larr; Overview
      </Link>
    </div>
  );
}
