import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createEntryAdmin, updateEntryAdmin, toggleDuesPaid } from "@/app/actions/admin-survivor";
import DeleteEntryButton from "./DeleteEntryButton";

type EntryOwner = { first_name: string | null; last_name: string | null; email: string | null };
type EntryRow = {
  id: string;
  entry_name: string | null;
  entry_number: number;
  status: string;
  eliminated_week_number: number | null;
  dues_paid: boolean;
  dues_paid_at: string | null;
  user_id: string;
  user: EntryOwner;
};

export default async function AdminSurvivorEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; add?: string; edit?: string; error?: string; created?: string; updated?: string; deleted?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: entriesData }, { data: bonusPicks }, { data: allUsers }] = await Promise.all([
    supabase
      .from("survivor_entries")
      .select(
        `id, entry_name, entry_number, status, eliminated_week_number, dues_paid, dues_paid_at, user_id,
         user:profiles!survivor_entries_user_id_fkey(first_name, last_name, email)`
      )
      .order("entry_number"),
    supabase.from("survivor_picks").select("entry_id").eq("is_bonus_week", true),
    supabase.from("profiles").select("id, first_name, last_name, email").order("first_name"),
  ]);

  const entries = (entriesData ?? []) as unknown as EntryRow[];

  const bonusCountByEntry = new Map<string, number>();
  (bonusPicks ?? []).forEach((p) => {
    bonusCountByEntry.set(p.entry_id, (bonusCountByEntry.get(p.entry_id) ?? 0) + 1);
  });

  const q = (params.q || "").trim().toLowerCase();
  const filtered = q
    ? entries.filter((e) => {
        const haystack = [
          e.entry_name,
          e.user?.first_name,
          e.user?.last_name,
          e.user?.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : entries;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-gold-400">Entries</h1>
        <a
          href="/admin/survivor/entries/export"
          className="rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-hover"
        >
          Export CSV
        </a>
      </div>
      <p className="mb-6 text-sm text-muted">{entries.length} total entries.</p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}
      {(params.created || params.updated || params.deleted) && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          {params.created && "Entry created."}
          {params.updated && "Entry updated."}
          {params.deleted && "Entry deleted."}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form action="/admin/survivor/entries" method="GET" className="flex gap-2">
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
            <Link href="/admin/survivor/entries" className="self-center text-sm text-muted hover:text-gold-400">
              Clear
            </Link>
          )}
        </form>
        <Link
          href={params.add ? "/admin/survivor/entries" : "/admin/survivor/entries?add=1"}
          className="rounded-md bg-gold-500 px-3 py-1.5 text-sm font-semibold text-app transition hover:bg-gold-600"
        >
          {params.add ? "Cancel" : "+ Add Entry"}
        </Link>
      </div>

      {params.add && (
        <form
          action={createEntryAdmin}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-gold-500 bg-gold-500/5 p-4"
        >
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">User</label>
            <select
              name="userId"
              required
              className="w-64 rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
            >
              <option value="">Select a user…</option>
              {(allUsers ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {[u.first_name, u.last_name].filter(Boolean).join(" ") || "(no name)"} — {u.email || "no email"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Entry name (optional)
            </label>
            <input
              type="text"
              name="entryName"
              className="rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gold-500 px-4 py-1.5 text-sm font-semibold text-app transition hover:bg-gold-600"
          >
            Create
          </button>
          <p className="w-full text-xs text-muted">
            Entry number is auto-assigned (1, then 2). Bypasses the entry deadline — this is an
            admin override.
          </p>
        </form>
      )}

      <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
        <div className="grid grid-cols-[1.5fr_1fr_auto_auto_auto_auto] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span>User</span>
          <span>Entry</span>
          <span>Status</span>
          <span>Dues</span>
          <span>Bonus</span>
          <span>Actions</span>
        </div>
        {filtered.map((entry) => {
          const ownerName = [entry.user?.first_name, entry.user?.last_name].filter(Boolean).join(" ") || "—";
          const isEditing = params.edit === entry.id;
          const bonusUsed = bonusCountByEntry.get(entry.id) ?? 0;

          if (isEditing) {
            return (
              <form
                key={entry.id}
                action={updateEntryAdmin}
                className="grid grid-cols-[1.5fr_1fr_auto_auto_auto_auto] items-center gap-3 bg-gold-500/5 px-4 py-3"
              >
                <input type="hidden" name="entryId" value={entry.id} />
                <div>
                  <p className="text-sm text-ink">{ownerName}</p>
                  <p className="text-xs text-muted">{entry.user?.email}</p>
                </div>
                <input
                  type="text"
                  name="entryName"
                  defaultValue={entry.entry_name || ""}
                  placeholder={`Entry ${entry.entry_number}`}
                  className="rounded-md border border-edge bg-app px-2 py-1 text-sm text-ink"
                />
                <select
                  name="status"
                  defaultValue={entry.status}
                  className="rounded-md border border-edge bg-app px-2 py-1 text-sm text-ink"
                >
                  <option value="active">active</option>
                  <option value="eliminated">eliminated</option>
                </select>
                <input
                  type="number"
                  name="eliminatedWeekNumber"
                  defaultValue={entry.eliminated_week_number ?? ""}
                  placeholder="wk #"
                  className="w-16 rounded-md border border-edge bg-app px-2 py-1 text-sm text-ink"
                />
                <span className="text-xs text-muted">{bonusUsed}/2</span>
                <div className="flex gap-2">
                  <button type="submit" className="text-xs font-medium text-gold-400 hover:underline">
                    Save
                  </button>
                  <Link href="/admin/survivor/entries" className="text-xs text-muted hover:underline">
                    Cancel
                  </Link>
                </div>
              </form>
            );
          }

          return (
            <div key={entry.id} className="grid grid-cols-[1.5fr_1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-3">
              <div>
                <p className="text-sm text-ink">{ownerName}</p>
                <p className="text-xs text-muted">{entry.user?.email || "no email"}</p>
              </div>
              <span className="text-sm text-ink">{entry.entry_name || `Entry ${entry.entry_number}`}</span>
              <span className={`text-xs font-medium ${entry.status === "eliminated" ? "text-dead" : "text-alive"}`}>
                {entry.status === "eliminated" ? `Eliminated (Wk ${entry.eliminated_week_number ?? "?"})` : "Alive"}
              </span>
              <form action={toggleDuesPaid}>
                <input type="hidden" name="entryId" value={entry.id} />
                <input type="hidden" name="nextValue" value={(!entry.dues_paid).toString()} />
                <button
                  type="submit"
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    entry.dues_paid ? "bg-alive/10 text-alive" : "bg-surface-hover text-muted"
                  }`}
                >
                  {entry.dues_paid ? "Paid" : "Unpaid"}
                </button>
              </form>
              <span className="text-xs text-muted">{bonusUsed}/2</span>
              <div className="flex gap-3">
                <Link
                  href={`/admin/survivor/entries?edit=${entry.id}`}
                  className="text-xs font-medium text-gold-400 hover:underline"
                >
                  Edit
                </Link>
                <DeleteEntryButton entryId={entry.id} label={entry.entry_name || `Entry ${entry.entry_number}`} />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="px-4 py-3 text-sm text-muted">No entries match.</p>}
      </div>
    </div>
  );
}
