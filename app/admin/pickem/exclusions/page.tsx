import { createClient } from "@/lib/supabase/server";
import { formatKickoff } from "@/lib/formatDate";
import {
  addRownumExclusion,
  toggleRownumExclusion,
  deleteRownumExclusion,
  addEmailExclusion,
  toggleEmailExclusion,
  deleteEmailExclusion,
} from "@/app/actions/admin-pickem-exclusions";

export default async function AdminPickemExclusionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const [{ data: rownumRows }, { data: emailRows }] = await Promise.all([
    supabase
      .from("pickem_rownum_exclusions")
      .select("rownum, active, note, created_at")
      .order("rownum"),
    supabase
      .from("pickem_admin_emails")
      .select("email, active, note, created_at")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        Pick&apos;em — Exclusions
      </h1>
      <p className="mb-6 text-sm text-muted">
        Exclude specific entry row numbers or email addresses from the eCount / pot
        calculation.
      </p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}
      {params.saved && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">Saved.</p>
      )}

      {/* Section A — Row Number Exclusions */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide text-ink">
          Row Number Exclusions
        </h2>

        <form action={addRownumExclusion} className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Row number</label>
            <input
              type="number"
              name="rownum"
              required
              min={0}
              step={1}
              className="w-28 rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Note</label>
            <input
              type="text"
              name="note"
              placeholder="Optional"
              className="w-full rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gold-500 px-4 py-1.5 text-sm font-semibold text-app transition hover:bg-gold-600"
          >
            Add
          </button>
        </form>

        <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
          {(rownumRows ?? []).length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">No row number exclusions yet.</p>
          )}
          {(rownumRows ?? []).map((row) => (
            <div key={row.rownum} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-data text-sm font-semibold text-ink">Row {row.rownum}</p>
                {row.note && <p className="text-xs text-muted">{row.note}</p>}
                <p className="text-[11px] text-muted">Added {formatKickoff(row.created_at)}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                    row.active ? "bg-alive/10 text-alive" : "bg-surface-hover text-muted"
                  }`}
                >
                  {row.active ? "Active" : "Inactive"}
                </span>
                <form action={toggleRownumExclusion}>
                  <input type="hidden" name="rownum" value={row.rownum} />
                  <button
                    type="submit"
                    className="rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-hover"
                  >
                    {row.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <form action={deleteRownumExclusion}>
                  <input type="hidden" name="rownum" value={row.rownum} />
                  <button
                    type="submit"
                    className="rounded-md border border-dead/40 px-3 py-1.5 text-xs font-medium text-dead transition hover:bg-dead/10"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section B — Email Exclusions */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide text-ink">
          Email Exclusions
        </h2>

        <form action={addEmailExclusion} className="mb-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Email</label>
            <input
              type="email"
              name="email"
              required
              placeholder="name@example.com"
              className="w-full rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Note</label>
            <input
              type="text"
              name="note"
              placeholder="Optional"
              className="w-full rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-gold-500 px-4 py-1.5 text-sm font-semibold text-app transition hover:bg-gold-600"
          >
            Add
          </button>
        </form>

        <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
          {(emailRows ?? []).length === 0 && (
            <p className="px-4 py-3 text-sm text-muted">No email exclusions yet.</p>
          )}
          {(emailRows ?? []).map((row) => (
            <div key={row.email} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{row.email}</p>
                {row.note && <p className="text-xs text-muted">{row.note}</p>}
                <p className="text-[11px] text-muted">Added {formatKickoff(row.created_at)}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                    row.active ? "bg-alive/10 text-alive" : "bg-surface-hover text-muted"
                  }`}
                >
                  {row.active ? "Active" : "Inactive"}
                </span>
                <form action={toggleEmailExclusion}>
                  <input type="hidden" name="email" value={row.email} />
                  <button
                    type="submit"
                    className="rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-hover"
                  >
                    {row.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <form action={deleteEmailExclusion}>
                  <input type="hidden" name="email" value={row.email} />
                  <button
                    type="submit"
                    className="rounded-md border border-dead/40 px-3 py-1.5 text-xs font-medium text-dead transition hover:bg-dead/10"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
