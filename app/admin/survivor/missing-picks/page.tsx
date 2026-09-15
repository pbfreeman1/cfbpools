import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEASON } from "@/lib/season";
import { adminSetMissingSurvivorPick } from "@/app/actions/admin-survivor";

type Week = { id: string; week_number: number; label: string | null; start_date: string };

type EntryOwner = { first_name: string | null; last_name: string | null; email: string | null };

type AvailableTeam = { team_id: string; school_name: string; short_name: string | null; logo_url: string | null };

type MissingEntry = {
  entryId: string;
  entryName: string;
  owner: EntryOwner | null;
  availableTeams: AvailableTeam[];
};

export default async function MissingPicksPage({
  searchParams,
}: {
  searchParams: Promise<{ schedule_id?: string; error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: weeksData } = await supabase
    .from("schedule")
    .select("id, week_number, label, start_date")
    .eq("season", SEASON)
    .order("week_number");
  const weeks = (weeksData ?? []) as Week[];

  // Default = current/most-recent week: the last week that has already
  // started, same rule /survivor/locked uses for "current week".
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentWeek =
    [...weeks].reverse().find((w) => todayStr >= w.start_date) ?? weeks[0] ?? null;

  const selectedScheduleId = params.schedule_id || currentWeek?.id || "";
  const selectedWeek = weeks.find((w) => w.id === selectedScheduleId) ?? null;

  let missingEntries: MissingEntry[] = [];

  if (selectedScheduleId) {
    const [{ data: activeEntriesData }, { data: pickedRows }, { data: teamAvailabilityData }] =
      await Promise.all([
        supabase
          .from("survivor_entries")
          .select(
            `id, entry_name, user:profiles!survivor_entries_user_id_fkey(first_name, last_name, email)`
          )
          .eq("status", "active"),
        supabase.from("survivor_picks").select("entry_id").eq("schedule_id", selectedScheduleId),
        supabase
          .from("survivor_team_availability")
          .select("team_id, school_name, short_name, logo_url")
          .order("school_name"),
      ]);

    const activeEntries = (activeEntriesData ?? []) as unknown as {
      id: string;
      entry_name: string | null;
      user: EntryOwner | null;
    }[];
    const teamAvailability = (teamAvailabilityData ?? []) as AvailableTeam[];

    const pickedEntryIds = new Set((pickedRows ?? []).map((p) => p.entry_id));
    const missing = activeEntries.filter((e) => !pickedEntryIds.has(e.id));
    const missingIds = missing.map((e) => e.id);

    const { data: usedRows } =
      missingIds.length > 0
        ? await supabase
            .from("survivor_picks")
            .select("entry_id, team_id, bonus_team_id")
            .in("entry_id", missingIds)
        : { data: [] };

    const usedByEntry = new Map<string, Set<string>>();
    (usedRows ?? []).forEach((r) => {
      const set = usedByEntry.get(r.entry_id) ?? new Set<string>();
      set.add(r.team_id);
      if (r.bonus_team_id) set.add(r.bonus_team_id);
      usedByEntry.set(r.entry_id, set);
    });

    const collator = new Intl.Collator("en", { sensitivity: "base" });
    missingEntries = missing
      .map((e) => {
        const used = usedByEntry.get(e.id) ?? new Set<string>();
        return {
          entryId: e.id,
          entryName: e.entry_name || "Entry",
          owner: e.user,
          availableTeams: teamAvailability.filter((t) => !used.has(t.team_id)),
        };
      })
      .sort((a, b) => {
        const byLast = collator.compare(a.owner?.last_name ?? "", b.owner?.last_name ?? "");
        if (byLast !== 0) return byLast;
        const byFirst = collator.compare(a.owner?.first_name ?? "", b.owner?.first_name ?? "");
        if (byFirst !== 0) return byFirst;
        return collator.compare(a.entryName, b.entryName);
      });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
          Missing Picks
        </h1>
        <Link href="/admin/survivor/entries" className="text-xs text-gold-400 hover:underline">
          &larr; Entries
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted">
        Active entries with no pick saved for the selected week. Picking a team here bypasses the
        kickoff lock the same way the per-entry admin editor does.
      </p>

      <form
        action="/admin/survivor/missing-picks"
        method="GET"
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <select
          name="schedule_id"
          defaultValue={selectedScheduleId}
          className="rounded-md border border-edge bg-app px-3 py-1.5 text-sm text-ink"
        >
          <option value="">— Select a week —</option>
          {weeks.map((w) => (
            <option key={w.id} value={w.id}>
              Week {w.week_number}
              {w.label && w.label !== `Week ${w.week_number}` ? ` — ${w.label}` : ""}
              {w.id === currentWeek?.id ? " (current)" : ""}
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
      {params.saved && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">Pick saved.</p>
      )}

      {selectedWeek && (
        <>
          <p className="mb-3 text-sm text-ink">
            <span className="font-semibold">{missingEntries.length}</span> entries missing picks
            for Week {selectedWeek.week_number}
            {selectedWeek.label && selectedWeek.label !== `Week ${selectedWeek.week_number}`
              ? ` — ${selectedWeek.label}`
              : ""}
            .
          </p>

          {missingEntries.length === 0 ? (
            <p className="rounded-lg border border-edge bg-surface px-4 py-3 text-sm text-muted">
              Every active entry has a pick for this week.
            </p>
          ) : (
            <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
              {missingEntries.map((entry) => {
                const ownerName =
                  [entry.owner?.first_name, entry.owner?.last_name].filter(Boolean).join(" ") ||
                  "—";
                return (
                  <details key={entry.entryId} className="group px-4 py-3">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-sm font-semibold text-ink">{entry.entryName}</span>
                        <span className="ml-2 text-xs text-muted">{ownerName}</span>
                        {entry.owner?.email && (
                          <span className="ml-2 text-xs text-muted">{entry.owner.email}</span>
                        )}
                      </div>
                      <span className="rounded-md border border-edge px-2 py-1 text-xs font-medium text-gold-400 group-open:hidden">
                        Pick &rarr;
                      </span>
                      <span className="hidden rounded-md border border-edge px-2 py-1 text-xs font-medium text-muted group-open:inline">
                        Close
                      </span>
                    </summary>

                    <div className="mt-3">
                      {entry.availableTeams.length === 0 ? (
                        <p className="text-xs text-dead">
                          No eligible teams left — every SEC team has already been used by this
                          entry.
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
                          {entry.availableTeams.map((team) => (
                            <form
                              key={team.team_id}
                              action={adminSetMissingSurvivorPick}
                            >
                              <input type="hidden" name="entryId" value={entry.entryId} />
                              <input type="hidden" name="scheduleId" value={selectedScheduleId} />
                              <input type="hidden" name="teamId" value={team.team_id} />
                              <button
                                type="submit"
                                className="flex w-full items-center gap-2 rounded-md border border-edge bg-app px-2 py-2 text-left text-xs font-medium text-ink transition hover:border-gold-400 hover:bg-surface-hover"
                              >
                                {team.logo_url && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={team.logo_url}
                                    alt=""
                                    className="h-5 w-5 flex-shrink-0 object-contain"
                                  />
                                )}
                                <span className="truncate">
                                  {team.short_name || team.school_name}
                                </span>
                              </button>
                            </form>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
