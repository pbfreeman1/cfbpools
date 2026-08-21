import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatKickoff } from "@/lib/formatDate";

const QUICK_LINKS = [
  { href: "/admin/survivor/results", label: "Enter Results", desc: "Record winners, run eliminations" },
  { href: "/admin/survivor/entries", label: "Entries", desc: "Full entry list, dues, CSV export" },
  { href: "/admin/survivor/bonus", label: "Bonus Weeks", desc: "Bonus week usage summary" },
  { href: "/admin/pickem/week", label: "Pick'em Week Setup", desc: "Select games, set spread overrides" },
  { href: "/admin/users", label: "Users", desc: "All registered users, admin flags" },
  { href: "/admin/email", label: "Email", desc: "Send test / manual emails" },
  { href: "/admin/system", label: "System", desc: "Sync logs, manual sync trigger" },
  { href: "/admin/audit", label: "Audit Log", desc: "Pick history across all entries" },
  { href: "/admin/season", label: "Season", desc: "Current week, phase, signups" },
];

function statusBadgeClass(status: string) {
  if (status === "success") return "bg-alive/10 text-alive";
  if (status === "error") return "bg-dead/10 text-dead";
  return "bg-gold-500/10 text-gold-400";
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [{ data: appSettings }, { data: poolStats }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("current_season, current_week_id, season_phase, survivor_signups_open, pickem_signups_open")
      .single(),
    supabase.from("survivor_pool_stats").select("*").single(),
  ]);

  let currentWeekNumber: number | null = null;
  const missingPickEntries: { id: string; name: string }[] = [];

  if (appSettings?.current_week_id) {
    const [{ data: week }, { data: activeEntries }, { data: picks }] = await Promise.all([
      supabase.from("schedule").select("week_number").eq("id", appSettings.current_week_id).single(),
      supabase
        .from("survivor_entries")
        .select("id, entry_name, entry_number")
        .eq("status", "active"),
      supabase
        .from("survivor_picks")
        .select("entry_id")
        .eq("schedule_id", appSettings.current_week_id),
    ]);

    currentWeekNumber = week?.week_number ?? null;
    const pickedEntryIds = new Set((picks ?? []).map((p) => p.entry_id));
    (activeEntries ?? []).forEach((e) => {
      if (!pickedEntryIds.has(e.id)) {
        missingPickEntries.push({ id: e.id, name: e.entry_name || `Entry ${e.entry_number}` });
      }
    });
  }

  const [{ data: lastSync }, { data: recentErrors }] = await Promise.all([
    supabase.from("sync_logs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("sync_logs")
      .select("*")
      .eq("status", "error")
      .order("started_at", { ascending: false })
      .limit(5),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        Command Center
      </h1>
      <p className="mb-8 text-sm text-muted">
        {appSettings
          ? `${appSettings.current_season} season · ${appSettings.season_phase}${
              currentWeekNumber ? ` · Week ${currentWeekNumber}` : ""
            }`
          : "app_settings not configured yet"}
      </p>

      {/* Survivor stat row */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-edge bg-surface p-4 text-center">
          <p className="text-2xl font-bold text-ink">{poolStats?.total_entries ?? 0}</p>
          <p className="text-xs text-muted">Total Entries</p>
        </div>
        <div className="rounded-lg border border-edge bg-surface p-4 text-center">
          <p className="text-2xl font-bold text-alive">{poolStats?.active_entries ?? 0}</p>
          <p className="text-xs text-muted">Alive</p>
        </div>
        <div className="rounded-lg border border-edge bg-surface p-4 text-center">
          <p className="text-2xl font-bold text-dead">{poolStats?.eliminated_entries ?? 0}</p>
          <p className="text-xs text-muted">Eliminated</p>
        </div>
        <div className="rounded-lg border border-edge bg-surface p-4 text-center">
          <p className="text-2xl font-bold text-gold-400">{missingPickEntries.length}</p>
          <p className="text-xs text-muted">Missing Pick</p>
        </div>
      </div>

      {missingPickEntries.length > 0 && (
        <div className="mb-8 rounded-lg border border-gold-500 bg-gold-500/10 p-4">
          <p className="mb-2 text-sm font-semibold text-gold-400">
            {missingPickEntries.length} active {missingPickEntries.length === 1 ? "entry hasn't" : "entries haven't"}{" "}
            picked for Week {currentWeekNumber}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink">
            {missingPickEntries.map((e) => (
              <span key={e.id}>{e.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* System health */}
      <div className="mb-8 rounded-lg border border-edge bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">System Health</h2>
          <Link href="/admin/system" className="text-xs text-gold-400 hover:underline">
            View all sync logs &rarr;
          </Link>
        </div>
        {lastSync ? (
          <div className="flex items-center gap-3 text-sm">
            <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${statusBadgeClass(lastSync.status)}`}>
              {lastSync.status}
            </span>
            <span className="text-ink">Last sync {formatKickoff(lastSync.started_at)}</span>
            {lastSync.games_updated !== null && (
              <span className="text-muted">· {lastSync.games_updated} games updated</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">No sync runs recorded yet.</p>
        )}

        {recentErrors && recentErrors.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-edge pt-3">
            {recentErrors.map((e) => (
              <p key={e.id} className="text-xs text-dead">
                {formatKickoff(e.started_at)} — {e.error_message || "Unknown error"}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Sections</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-edge bg-surface p-4 transition hover:border-gold-500 hover:bg-surface-hover"
          >
            <p className="font-display text-sm font-semibold uppercase tracking-wide text-ink">
              {link.label}
            </p>
            <p className="mt-0.5 text-xs text-muted">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
