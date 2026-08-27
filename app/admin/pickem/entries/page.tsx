import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatKickoff } from "@/lib/formatDate";
import DeletePickemEntryButton from "./DeletePickemEntryButton";

type EntryOwner = { first_name: string | null; last_name: string | null; email: string | null };
type EntryRow = {
  id: string;
  entry_name: string;
  entrant_email: string;
  rownum: number | null;
  is_ecount_eligible: boolean;
  created_at: string;
  user_id: string | null;
  user: EntryOwner | null;
};

export default async function AdminPickemEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; updated?: string; deleted?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("current_week_id")
    .single();
  const scheduleId = appSettings?.current_week_id ?? null;

  let week: { week_number: number; label: string | null } | null = null;
  let entries: EntryRow[] = [];
  const pickCountByEntry = new Map<string, number>();

  if (scheduleId) {
    const [{ data: weekData }, { data: entriesData }] = await Promise.all([
      supabase.from("schedule").select("week_number, label").eq("id", scheduleId).single(),
      supabase
        .from("pickem_entries")
        .select(
          `id, entry_name, entrant_email, rownum, is_ecount_eligible, created_at, user_id,
           user:profiles!pickem_entries_user_id_fkey(first_name, last_name, email)`
        )
        .eq("schedule_id", scheduleId)
        .order("rownum"),
    ]);
    week = weekData;
    entries = (entriesData ?? []) as unknown as EntryRow[];

    if (entries.length > 0) {
      const { data: pickRows } = await supabase
        .from("pickem_picks")
        .select("entry_id")
        .in(
          "entry_id",
          entries.map((e) => e.id)
        );
      (pickRows ?? []).forEach((p) => {
        pickCountByEntry.set(p.entry_id, (pickCountByEntry.get(p.entry_id) ?? 0) + 1);
      });
    }
  }

  const q = (params.q || "").trim().toLowerCase();
  const filtered = q
    ? entries.filter((e) => {
        const haystack = [e.entry_name, e.entrant_email, e.user?.first_name, e.user?.last_name, e.user?.email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : entries;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
          Pick&apos;em — Entries
        </h1>
        <Link href="/admin/pickem" className="text-xs text-gold-400 hover:underline">
          &larr; Overview
        </Link>
      </div>
      <p className="mb-6 text-sm text-muted">
        {week ? `Week ${week.week_number}${week.label ? ` — ${week.label}` : ""} — ` : ""}
        {entries.length} total {entries.length === 1 ? "entry" : "entries"}.
      </p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}
      {(params.updated || params.deleted) && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          {params.updated && "Entry updated."}
          {params.deleted && "Entry deleted."}
        </p>
      )}

      <form action="/admin/pickem/entries" method="GET" className="mb-4 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={params.q || ""}
          placeholder="Search name or email…"
          className="w-56 rounded-md border border-edge bg-app px-3 py-1.5 text-sm text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
        >
          Search
        </button>
        {params.q && (
          <Link href="/admin/pickem/entries" className="self-center text-sm text-muted hover:text-gold-400">
            Clear
          </Link>
        )}
      </form>

      {!scheduleId ? (
        <p className="text-sm text-muted">No current week is set — see Season Control.</p>
      ) : (
        <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
          <div className="grid grid-cols-[1.5fr_1.5fr_auto_auto_auto_auto_auto] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <span>Entry</span>
            <span>Entrant</span>
            <span>Row #</span>
            <span>eCount</span>
            <span>Picks</span>
            <span>Created</span>
            <span>Actions</span>
          </div>
          {filtered.map((entry) => {
            const ownerName = [entry.user?.first_name, entry.user?.last_name].filter(Boolean).join(" ");
            const picksMade = pickCountByEntry.get(entry.id) ?? 0;
            return (
              <div
                key={entry.id}
                className="grid grid-cols-[1.5fr_1.5fr_auto_auto_auto_auto_auto] items-center gap-3 px-4 py-3"
              >
                <span className="truncate text-sm text-ink">{entry.entry_name}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{ownerName || "—"}</p>
                  <p className="truncate text-xs text-muted">{entry.entrant_email}</p>
                </div>
                <span className="font-data text-sm text-muted">{entry.rownum ?? "—"}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    entry.is_ecount_eligible ? "bg-alive/10 text-alive" : "bg-surface-hover text-muted"
                  }`}
                >
                  {entry.is_ecount_eligible ? "Eligible" : "Excluded"}
                </span>
                <span className="font-data text-sm text-ink">{picksMade}/6</span>
                <span className="whitespace-nowrap text-xs text-muted">{formatKickoff(entry.created_at)}</span>
                <div className="flex gap-3">
                  <Link
                    href={`/admin/pickem/entries/${entry.id}`}
                    className="text-xs font-medium text-gold-400 hover:underline"
                  >
                    Edit
                  </Link>
                  <DeletePickemEntryButton entryId={entry.id} label={entry.entry_name} />
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="px-4 py-3 text-sm text-muted">No entries match.</p>}
        </div>
      )}
    </div>
  );
}
