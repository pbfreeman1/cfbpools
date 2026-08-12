import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type TeamRef = { school_name: string; short_name: string | null; logo_url: string | null };

function TeamChip({ team }: { team?: TeamRef }) {
  if (!team) return <span className="text-xs text-muted">—</span>;
  return (
    <span className="flex items-center gap-1.5">
      {team.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo_url} alt="" className="h-4 w-4 flex-shrink-0 object-contain" />
      )}
      <span className="text-sm text-ink">{team.short_name || team.school_name}</span>
    </span>
  );
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entryId?: string; scheduleId?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: allEntries }, { data: allWeeks }] = await Promise.all([
    supabase.from("survivor_entries").select("id, entry_name, entry_number").order("entry_number"),
    supabase.from("schedule").select("id, week_number").order("week_number"),
  ]);

  let query = supabase
    .from("survivor_picks_log")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(200);
  if (params.entryId) query = query.eq("entry_id", params.entryId);
  if (params.scheduleId) query = query.eq("schedule_id", params.scheduleId);
  if (params.from) query = query.gte("changed_at", params.from);
  if (params.to) query = query.lte("changed_at", `${params.to}T23:59:59`);

  const { data: logRows } = await query;

  const entryIds = [...new Set((logRows ?? []).map((r) => r.entry_id))];
  const scheduleIds = [...new Set((logRows ?? []).map((r) => r.schedule_id))];
  const teamIds = [
    ...new Set((logRows ?? []).flatMap((r) => [r.team_id, r.bonus_team_id].filter(Boolean) as string[])),
  ];

  const [{ data: entries }, { data: weeks }, { data: teams }] = await Promise.all([
    entryIds.length
      ? supabase.from("survivor_entries").select("id, entry_name, entry_number").in("id", entryIds)
      : Promise.resolve({ data: [] }),
    scheduleIds.length
      ? supabase.from("schedule").select("id, week_number").in("id", scheduleIds)
      : Promise.resolve({ data: [] }),
    teamIds.length
      ? supabase.from("master_teams").select("id, school_name, short_name, logo_url").in("id", teamIds)
      : Promise.resolve({ data: [] }),
  ]);

  const entryById = new Map((entries ?? []).map((e) => [e.id, e]));
  const weekById = new Map((weeks ?? []).map((w) => [w.id, w.week_number]));
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));

  const hasFilters = params.entryId || params.scheduleId || params.from || params.to;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        Audit Log
      </h1>
      <p className="mb-6 text-sm text-muted">Pick history from survivor_picks_log — every change, versioned.</p>

      <form action="/admin/audit" method="GET" className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Entry</label>
          <select
            name="entryId"
            defaultValue={params.entryId || ""}
            className="rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
          >
            <option value="">All entries</option>
            {(allEntries ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.entry_name || `Entry ${e.entry_number}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Week</label>
          <select
            name="scheduleId"
            defaultValue={params.scheduleId || ""}
            className="rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
          >
            <option value="">All weeks</option>
            {(allWeeks ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                Week {w.week_number}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">From</label>
          <input
            type="date"
            name="from"
            defaultValue={params.from || ""}
            className="rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">To</label>
          <input
            type="date"
            name="to"
            defaultValue={params.to || ""}
            className="rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-gold-500 px-4 py-1.5 text-sm font-semibold text-app transition hover:bg-gold-600"
        >
          Filter
        </button>
        {hasFilters && (
          <Link href="/admin/audit" className="text-sm text-muted hover:text-gold-400">
            Clear
          </Link>
        )}
      </form>

      <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
        <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span>Changed</span>
          <span>Entry</span>
          <span>Pick</span>
          <span>Week</span>
          <span>v</span>
        </div>
        {(logRows ?? []).map((row) => {
          const entry = entryById.get(row.entry_id);
          const team = teamById.get(row.team_id);
          const bonusTeam = row.bonus_team_id ? teamById.get(row.bonus_team_id) : undefined;
          return (
            <div key={row.id} className="grid grid-cols-[auto_1fr_1fr_auto_auto] items-center gap-3 px-4 py-2.5">
              <span className="whitespace-nowrap text-xs text-muted">
                {new Date(row.changed_at).toLocaleString()}
              </span>
              <span className="text-sm text-ink">
                {entry ? entry.entry_name || `Entry ${entry.entry_number}` : row.entry_id}
              </span>
              <span className="flex items-center gap-2">
                <TeamChip team={team} />
                {row.is_bonus_week && (
                  <>
                    <span className="text-xs text-muted">+</span>
                    <TeamChip team={bonusTeam} />
                  </>
                )}
              </span>
              <span className="text-sm text-muted">
                {weekById.has(row.schedule_id) ? `Wk ${weekById.get(row.schedule_id)}` : "—"}
              </span>
              <span className="font-data text-xs text-muted">{row.version}</span>
            </div>
          );
        })}
        {(!logRows || logRows.length === 0) && (
          <p className="px-4 py-3 text-sm text-muted">No pick changes match these filters.</p>
        )}
      </div>
    </div>
  );
}
