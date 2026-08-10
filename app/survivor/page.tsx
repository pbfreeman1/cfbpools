import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEASON, ENTRY_DEADLINE } from "@/lib/season";
import CountdownTimer from "@/app/components/CountdownTimer";

export default async function SurvivorHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public pool-wide info — visible whether or not you're logged in.
  const { data: stats } = await supabase.from("survivor_pool_stats").select("*").single();

  const { data: weeks } = await supabase
    .from("schedule")
    .select("id, week_number, start_date, end_date")
    .eq("season", SEASON)
    .order("week_number");

  const today = new Date();
  const currentWeek =
    (weeks ?? []).find((w) => today >= new Date(w.start_date) && today <= new Date(w.end_date)) ??
    (weeks ?? []).find((w) => new Date(w.start_date) > today);

  const deadlinePassed = today > ENTRY_DEADLINE;

  let nextKickoff: string | null = null;
  if (currentWeek) {
    const { data: nextGame } = await supabase
      .from("games")
      .select("kickoff_time")
      .eq("schedule_id", currentWeek.id)
      .gt("kickoff_time", today.toISOString())
      .order("kickoff_time")
      .limit(1)
      .maybeSingle();
    nextKickoff = nextGame?.kickoff_time ?? null;
  }

  // Personalized section — only meaningful if logged in.
  let entries: { id: string; entry_number: number; entry_name: string | null; status: string }[] =
    [];
  if (user) {
    const { data } = await supabase
      .from("survivor_entries")
      .select("id, entry_number, entry_name, status")
      .eq("user_id", user.id)
      .order("entry_number");
    entries = data ?? [];
  }
  const canCreateAnother = user && entries.length < 2 && !deadlinePassed;

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12">
      <Link href="/" className="mb-4 inline-block text-sm text-gold-400 hover:underline">
        &larr; All pools
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">SEC Survivor Pool</h1>
      <p className="mb-6 text-sm text-muted">
        Pick one SEC team to win each week. 16 teams, 14 weeks — use your 2 bonus picks wisely.
      </p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}

      {/* Public pool stats */}
      <div className="mb-6 grid grid-cols-3 gap-2 rounded-lg border border-edge bg-surface p-4 text-center">
        <div>
          <p className="text-xl font-bold text-ink">{stats?.total_entries ?? 0}</p>
          <p className="text-xs text-muted">Entries</p>
        </div>
        <div>
          <p className="text-xl font-bold text-alive">{stats?.active_entries ?? 0}</p>
          <p className="text-xs text-muted">Alive</p>
        </div>
        <div>
          <p className="text-xl font-bold text-dead">{stats?.eliminated_entries ?? 0}</p>
          <p className="text-xs text-muted">Eliminated</p>
        </div>
      </div>

      {nextKickoff && (
        <div className="mb-6">
          <CountdownTimer target={nextKickoff} label="Next kickoff locks picks in" />
        </div>
      )}

      <p className="mb-6 text-center text-sm text-muted">
        {currentWeek ? (
          <>
            Current week: <span className="font-medium">Week {currentWeek.week_number}</span>
          </>
        ) : (
          "Season schedule not yet loaded"
        )}
        {!deadlinePassed && (
          <>
            {" "}
            &middot; Entry deadline{" "}
            <span className="font-medium">
              {ENTRY_DEADLINE.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </>
        )}
      </p>

      <Link
        href="/survivor/locked"
        className="mb-6 block rounded-md border border-edge px-4 py-2.5 text-center text-base font-medium text-ink transition hover:bg-surface-hover"
      >
        View locked picks
      </Link>

      {/* Personalized section */}
      {!user ? (
        <div className="rounded-lg border border-edge bg-surface p-4 text-center">
          <p className="mb-3 text-sm text-muted">Log in to make your picks.</p>
          <Link
            href="/login"
            className="inline-block rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600"
          >
            Log in
          </Link>
        </div>
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Your entries
          </h2>
          {entries.length === 0 ? (
            <p className="mb-4 text-sm text-muted">You don&apos;t have an entry yet.</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-3">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/survivor/${entry.id}`}
                    className="flex items-center justify-between rounded-md border border-edge px-4 py-3 transition hover:bg-surface"
                  >
                    <span className="font-medium text-ink">
                      {entry.entry_name || `Entry ${entry.entry_number}`}
                    </span>
                    <span
                      className={
                        entry.status === "eliminated"
                          ? "rounded-full bg-dead/15 px-2 py-0.5 text-xs font-medium text-dead"
                          : "rounded-full bg-alive/15 px-2 py-0.5 text-xs font-medium text-alive"
                      }
                    >
                      {entry.status === "eliminated" ? "Eliminated" : "Alive"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {canCreateAnother && (
            <Link
              href="/survivor/new"
              className="block rounded-md bg-gold-500 px-4 py-2.5 text-center text-base font-semibold text-app transition hover:bg-gold-600"
            >
              Create {entries.length > 0 ? "second" : "an"} entry
            </Link>
          )}
          {deadlinePassed && entries.length === 0 && (
            <p className="text-center text-sm text-dead">Entry deadline has passed.</p>
          )}
        </>
      )}
    </main>
  );
}
