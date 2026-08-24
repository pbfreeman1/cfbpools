import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatKickoff } from "@/lib/formatDate";

export default async function PickemHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("current_week_id")
    .single();

  const scheduleId = appSettings?.current_week_id ?? null;

  let week: { id: string; season: number; week_number: number; label: string | null } | null = null;
  let ecount = 0;
  let openGamesCount = 0;

  if (scheduleId) {
    const [{ data: weekData }, { data: ecountRow }, { count: openCount }] = await Promise.all([
      supabase.from("schedule").select("id, season, week_number, label").eq("id", scheduleId).single(),
      supabase.from("pickem_week_ecount").select("ecount").eq("schedule_id", scheduleId).maybeSingle(),
      // Mirrors prepare_pickem_entry()'s own "fewer than 6 games remaining
      // closes entry" check exactly — same table, same three filters — so
      // this can never drift from what the DB trigger actually enforces.
      supabase
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("schedule_id", scheduleId)
        .eq("pickem_selected", true)
        .eq("status", "scheduled")
        .gt("kickoff_time", new Date().toISOString()),
    ]);
    week = weekData;
    ecount = ecountRow?.ecount ?? 0;
    openGamesCount = openCount ?? 0;
  }

  const closed = openGamesCount < 6;

  let entries: { id: string; entry_name: string; created_at: string }[] = [];
  const pickCountByEntry = new Map<string, number>();

  if (user && scheduleId) {
    const { data: entryRows } = await supabase
      .from("pickem_entries")
      .select("id, entry_name, created_at")
      .eq("user_id", user.id)
      .eq("schedule_id", scheduleId)
      .order("created_at");
    entries = entryRows ?? [];

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

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl">
      <Link href="/" className="mb-4 inline-block text-sm text-pickem-400 hover:underline">
        &larr; All pools
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-pickem-400">
        Weekly Pick&apos;em Pool
      </h1>
      <p className="mb-6 text-sm text-muted">
        Pick 6 games against the spread each week. Go 6-0 to win the pot — pushes count as
        losses.
      </p>

      {!scheduleId || !week ? (
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          Season schedule not yet loaded.
        </p>
      ) : (
        <>
          <div className="mb-6 rounded-lg border border-edge bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">
                Week {week.week_number}
              </h2>
              <span
                className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                  closed ? "bg-dead/10 text-dead" : "bg-alive/10 text-alive"
                }`}
              >
                {closed ? "Entries closed" : "Entries open"}
              </span>
            </div>
            {week.label && <p className="mb-3 text-sm text-muted">{week.label}</p>}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md bg-app px-3 py-3">
                <p className="font-data text-2xl font-bold text-ink">{ecount}</p>
                <p className="mt-1 text-xs text-muted">eCount so far</p>
              </div>
              <div className="rounded-md bg-app px-3 py-3">
                <p className="font-data text-2xl font-bold text-ink">{openGamesCount}</p>
                <p className="mt-1 text-xs text-muted">games still open</p>
              </div>
            </div>
            {closed && (
              <p className="mt-3 text-xs text-muted">
                Fewer than 6 games remain before kickoff this week, so new entries and picks
                are closed until next week&apos;s games are posted.
              </p>
            )}
          </div>

          <Link
            href={`/pickem/leaderboard?schedule_id=${week.id}`}
            className="mb-6 block rounded-md border border-edge px-3 py-2.5 text-center text-sm font-medium text-ink transition hover:bg-surface-hover"
          >
            View Leaderboard
          </Link>

          {!user ? (
            <div className="rounded-lg border border-edge bg-surface p-4 text-center">
              <p className="mb-3 text-sm text-muted">Log in to create an entry and make your picks.</p>
              <Link
                href="/login"
                className="inline-block rounded-md bg-pickem-500 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-pickem-600"
              >
                Log in
              </Link>
            </div>
          ) : (
            <>
              {closed ? (
                <div className="mb-6 rounded-lg border border-dashed border-pickem-500/40 bg-pickem-500/5 px-4 py-4 text-center">
                  <p className="font-display text-sm font-bold uppercase tracking-wide text-pickem-400">
                    Entries closed for Week {week.week_number}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Check back once next week&apos;s games are posted.
                  </p>
                </div>
              ) : (
                <Link
                  href={`/pickem/entries/new?schedule_id=${week.id}`}
                  className="mb-6 block rounded-lg bg-pickem-500 px-4 py-4 text-center font-display text-base font-bold uppercase tracking-wide text-ink shadow-lg shadow-pickem-500/20 transition hover:bg-pickem-600"
                >
                  + Create New Entry
                </Link>
              )}

              {entries.length === 0 ? (
                <p className="text-center text-sm text-muted">
                  You don&apos;t have an entry for Week {week.week_number} yet.
                </p>
              ) : (
                <>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                    Your entries — Week {week.week_number}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {entries.map((entry) => {
                      const picksMade = pickCountByEntry.get(entry.id) ?? 0;
                      return (
                        <Link
                          key={entry.id}
                          href={`/pickem/entries/${entry.id}/edit`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-surface px-4 py-3 transition hover:border-pickem-500/50 hover:bg-surface-hover"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">{entry.entry_name}</p>
                            <p className="text-xs text-muted">Entered {formatKickoff(entry.created_at)}</p>
                          </div>
                          <span className="flex-shrink-0 font-data text-sm font-semibold text-pickem-400">
                            {picksMade}/6
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
