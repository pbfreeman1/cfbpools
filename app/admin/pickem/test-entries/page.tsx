import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPickemTestEntries } from "@/app/actions/admin-pickem-test";
import TestEntryImport, { type ImportGame } from "./TestEntryImport";
import TestEntryRecords, { type RecordGame } from "./TestEntryRecords";

type TeamRef = { id: string; school_name: string; short_name: string | null };
type GameRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_team: TeamRef;
  away_team: TeamRef;
};

export default async function AdminPickemTestEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ schedule_id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: appSettings }, { data: weeks }] = await Promise.all([
    supabase.from("app_settings").select("current_week_id").single(),
    supabase
      .from("schedule")
      .select("id, season, week_number")
      .order("season", { ascending: false })
      .order("week_number"),
  ]);

  // Same ?schedule_id= override pattern as /admin/pickem/entries and
  // /pickem/leaderboard — the param wins, otherwise the current week.
  const scheduleId = params.schedule_id || appSettings?.current_week_id || null;

  const weekSelector = (
    <form action="/admin/pickem/test-entries" method="GET" className="mb-6 flex flex-wrap items-center gap-2">
      <select
        name="schedule_id"
        defaultValue={params.schedule_id || appSettings?.current_week_id || ""}
        className="rounded-md border border-edge bg-app px-3 py-1.5 text-sm text-ink"
      >
        <option value="">— Select a week —</option>
        {(weeks ?? []).map((w) => (
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
  );

  const header = (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
          Pick&apos;em — Test Entries
        </h1>
        <Link href="/admin/pickem" className="text-xs text-gold-400 hover:underline">
          &larr; Overview
        </Link>
      </div>
    </>
  );

  if (!scheduleId) {
    return (
      <div className="mx-auto max-w-5xl">
        {header}
        <p className="mb-6 text-sm text-muted">
          No current week is set — see Season Control, or pick a week below.
        </p>
        {weekSelector}
      </div>
    );
  }

  const [{ data: week }, { data: gamesData }, testEntries] = await Promise.all([
    supabase.from("schedule").select("week_number, label").eq("id", scheduleId).single(),
    supabase
      .from("games")
      .select(
        `id, home_team_id, away_team_id,
         home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name),
         away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name)`
      )
      .eq("schedule_id", scheduleId)
      .eq("pickem_selected", true)
      .order("kickoff_time"),
    getPickemTestEntries(scheduleId),
  ]);

  const games = (gamesData ?? []) as unknown as GameRow[];

  // The import RPC matches CSV picks against school_name OR short_name, so
  // the template uses school_name — the unambiguous one. The records view's
  // per-pick dropdown labels with short_name where there is one, matching
  // every other admin pick editor.
  const importGames: ImportGame[] = games.map((g) => ({
    id: g.id,
    homeName: g.home_team.school_name,
    awayName: g.away_team.school_name,
  }));

  const recordGames: RecordGame[] = games.map((g) => ({
    id: g.id,
    homeTeamId: g.home_team_id,
    awayTeamId: g.away_team_id,
    homeName: g.home_team.short_name || g.home_team.school_name,
    awayName: g.away_team.short_name || g.away_team.school_name,
  }));

  const weekLabel = `Week ${week?.week_number ?? "?"}`;

  return (
    <div className="mx-auto max-w-5xl">
      {header}
      <p className="mb-4 text-sm text-muted">
        {weekLabel}
        {week?.label ? ` — ${week.label}` : ""} — {games.length} selected game
        {games.length === 1 ? "" : "s"}.
        {params.schedule_id && scheduleId !== appSettings?.current_week_id && (
          <span className="ml-1 text-gold-400">(viewing a non-current week)</span>
        )}
      </p>

      {weekSelector}

      {games.length === 0 ? (
        <p className="rounded-lg border border-edge bg-surface p-4 text-sm text-muted">
          No Pick&apos;em games are selected for this week yet — set the slate in{" "}
          <Link href="/admin/pickem/week" className="text-gold-400 hover:underline">
            Week Setup
          </Link>{" "}
          before importing test entries.
        </p>
      ) : (
        <TestEntryImport scheduleId={scheduleId} weekLabel={weekLabel} games={importGames} />
      )}

      <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide text-ink">
        Test entry records
      </h2>
      {testEntries === null ? (
        <p className="rounded-lg border border-edge bg-surface p-4 text-sm text-dead">
          Couldn&apos;t load test entries for this week.
        </p>
      ) : (
        <TestEntryRecords
          scheduleId={scheduleId}
          initialEntries={testEntries}
          games={recordGames}
        />
      )}
    </div>
  );
}
