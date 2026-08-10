import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SEASON, ENTRY_DEADLINE } from "@/lib/season";

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
    .select("week_number, start_date, end_date")
    .eq("season", SEASON)
    .order("week_number");

  const today = new Date();
  const currentWeek =
    (weeks ?? []).find((w) => today >= new Date(w.start_date) && today <= new Date(w.end_date)) ??
    (weeks ?? []).find((w) => new Date(w.start_date) > today);

  const deadlinePassed = today > ENTRY_DEADLINE;

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
      <Link href="/" className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        &larr; All pools
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-brand-700">SEC Survivor Pool</h1>
      <p className="mb-6 text-sm text-slate-600">
        Pick one SEC team to win each week. 16 teams, 14 weeks — use your 2 bonus picks wisely.
      </p>

      {params.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
      )}

      {/* Public pool stats */}
      <div className="mb-6 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
        <div>
          <p className="text-xl font-bold text-slate-800">{stats?.total_entries ?? 0}</p>
          <p className="text-xs text-slate-500">Entries</p>
        </div>
        <div>
          <p className="text-xl font-bold text-green-700">{stats?.active_entries ?? 0}</p>
          <p className="text-xs text-slate-500">Alive</p>
        </div>
        <div>
          <p className="text-xl font-bold text-red-700">{stats?.eliminated_entries ?? 0}</p>
          <p className="text-xs text-slate-500">Eliminated</p>
        </div>
      </div>

      <p className="mb-6 text-center text-sm text-slate-600">
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
        className="mb-6 block rounded-md border border-slate-300 px-4 py-2.5 text-center text-base font-medium text-slate-700 transition hover:bg-slate-100"
      >
        View locked picks
      </Link>

      {/* Personalized section */}
      {!user ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
          <p className="mb-3 text-sm text-slate-600">Log in to make your picks.</p>
          <Link
            href="/login"
            className="inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Log in
          </Link>
        </div>
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your entries
          </h2>
          {entries.length === 0 ? (
            <p className="mb-4 text-sm text-slate-600">You don&apos;t have an entry yet.</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-3">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/survivor/${entry.id}`}
                    className="flex items-center justify-between rounded-md border border-slate-300 px-4 py-3 transition hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-800">
                      {entry.entry_name || `Entry ${entry.entry_number}`}
                    </span>
                    <span
                      className={
                        entry.status === "eliminated"
                          ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                          : "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
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
              className="block rounded-md bg-brand-600 px-4 py-2.5 text-center text-base font-semibold text-white transition hover:bg-brand-700"
            >
              Create {entries.length > 0 ? "second" : "an"} entry
            </Link>
          )}
          {deadlinePassed && entries.length === 0 && (
            <p className="text-center text-sm text-red-600">Entry deadline has passed.</p>
          )}
        </>
      )}
    </main>
  );
}
