import { createClient } from "@/lib/supabase/server";
import { triggerSync } from "@/app/actions/admin-system";
import { formatKickoff } from "@/lib/formatDate";

function statusBadgeClass(status: string) {
  if (status === "success") return "bg-alive/10 text-alive";
  if (status === "error") return "bg-dead/10 text-dead";
  return "bg-gold-500/10 text-gold-400";
}

export default async function AdminSystemPage({
  searchParams,
}: {
  searchParams: Promise<{ synced?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("sync_logs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50);

  const triggeredByIds = [...new Set((logs ?? []).map((l) => l.triggered_by).filter(Boolean))] as string[];
  const { data: admins } =
    triggeredByIds.length > 0
      ? await supabase.from("profiles").select("id, first_name, last_name").in("id", triggeredByIds)
      : { data: [] };
  const adminNameById = new Map(
    (admins ?? []).map((a) => [a.id, [a.first_name, a.last_name].filter(Boolean).join(" ") || "Admin"])
  );

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        System
      </h1>
      <p className="mb-6 text-sm text-muted">CFBD sync history and manual trigger.</p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}
      {params.synced && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">
          Sync complete — {params.synced}.
        </p>
      )}

      <form action={triggerSync} className="mb-6">
        <button
          type="submit"
          className="rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600"
        >
          Re-run Sync Now
        </button>
        <p className="mt-2 text-xs text-muted">
          Invokes the cfbd-sync Edge Function directly — teams, schedule, and scores for the
          current season. Can take a little while; the page will show the new row below once it
          finishes.
        </p>
      </form>

      <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span>Status</span>
          <span>Started</span>
          <span>Games</span>
          <span>Triggered By</span>
        </div>
        {(logs ?? []).map((log) => (
          <div key={log.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-2.5">
            <span className={`w-fit rounded px-2 py-0.5 text-xs font-medium uppercase ${statusBadgeClass(log.status)}`}>
              {log.status}
            </span>
            <span className="text-sm text-ink">{formatKickoff(log.started_at)}</span>
            <span className="text-sm text-muted">{log.games_updated ?? "—"}</span>
            <span className="text-xs text-muted">
              {log.triggered_by ? adminNameById.get(log.triggered_by) || "Admin" : "Cron"}
            </span>
            {log.status === "error" && log.error_message && (
              <p className="col-span-4 -mt-1 text-xs text-dead">{log.error_message}</p>
            )}
          </div>
        ))}
        {(!logs || logs.length === 0) && (
          <p className="px-4 py-3 text-sm text-muted">No sync runs recorded yet.</p>
        )}
      </div>

      <p className="mt-6 text-xs text-muted">
        Resend delivery stats aren&apos;t wired up yet — their API needs a bit more integration
        work than fits here.
      </p>
    </div>
  );
}
