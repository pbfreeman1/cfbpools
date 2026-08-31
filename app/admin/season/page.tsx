import { createClient } from "@/lib/supabase/server";
import { updateAppSettings } from "@/app/actions/admin-season";
import { formatKickoff } from "@/lib/formatDate";

const SEASON_PHASES = ["pre_season", "active", "complete"];

export default async function AdminSeasonPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: appSettings } = await supabase.from("app_settings").select("*").single();
  const { data: weeks } = await supabase
    .from("schedule")
    .select("id, season, week_number")
    .order("season", { ascending: false })
    .order("week_number");

  let updatedByName: string | null = null;
  if (appSettings?.updated_by) {
    const { data: admin } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", appSettings.updated_by)
      .single();
    updatedByName = admin ? [admin.first_name, admin.last_name].filter(Boolean).join(" ") : null;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        Season Control
      </h1>
      <p className="mb-6 text-sm text-muted">
        Single source of truth for &quot;current week&quot; — every other admin page reads it from
        here rather than deriving it independently.
      </p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}
      {params.saved && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">Settings saved.</p>
      )}

      <form action={updateAppSettings} className="space-y-5 rounded-lg border border-edge bg-surface p-5">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
            Current Season
          </label>
          <input
            type="number"
            name="current_season"
            defaultValue={appSettings?.current_season}
            required
            className="w-32 rounded-md border border-edge bg-app px-3 py-2 text-sm text-ink"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
            Current Week
          </label>
          <select
            name="current_week_id"
            defaultValue={appSettings?.current_week_id ?? ""}
            className="w-full rounded-md border border-edge bg-app px-3 py-2 text-sm text-ink"
          >
            <option value="">— None set —</option>
            {(weeks ?? []).map((w) => (
              <option key={w.id} value={w.id}>
                {w.season} — Week {w.week_number}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
            Season Phase
          </label>
          <select
            name="season_phase"
            defaultValue={appSettings?.season_phase}
            className="w-full rounded-md border border-edge bg-app px-3 py-2 text-sm text-ink"
          >
            {SEASON_PHASES.map((p) => (
              <option key={p} value={p}>
                {p.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="survivor_signups_open"
              defaultChecked={appSettings?.survivor_signups_open}
              className="accent-gold-500"
            />
            Survivor signups open
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="pickem_signups_open"
              defaultChecked={appSettings?.pickem_signups_open}
              className="accent-gold-500"
            />
            Pick&apos;em signups open
            <span className="text-xs text-muted">(pool isn&apos;t built yet — flag has no effect)</span>
          </label>
        </div>

        <button
          type="submit"
          className="rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600"
        >
          Save
        </button>

        {appSettings?.updated_at && (
          <p className="text-xs text-muted">
            Last updated {formatKickoff(appSettings.updated_at)}
            {updatedByName ? ` by ${updatedByName}` : ""}
          </p>
        )}
      </form>
    </div>
  );
}
