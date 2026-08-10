import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ENTRY_DEADLINE } from "@/lib/season";
import CountdownTimer from "@/app/components/CountdownTimer";

export default async function Home() {
  const supabase = await createClient();

  const { data: stats } = await supabase.from("survivor_pool_stats").select("*").single();
  const deadlinePassed = new Date() > ENTRY_DEADLINE;

  return (
    <main className="mx-auto min-h-screen max-w-md px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
          Open Pools
        </h1>
        <p className="mt-2 text-muted">2026 college football season.</p>
      </div>

      {/* SEC Survivor Pool section */}
      <section className="mb-6 rounded-lg border border-edge bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink">
            SEC Survivor Pool
          </h2>
          <span className="rounded-full bg-alive/15 px-2 py-0.5 text-xs font-medium text-alive">
            Open
          </span>
        </div>
        <p className="mb-4 text-sm text-muted">
          Pick one SEC team to win each week. Lose and you&apos;re out. Last one standing wins the
          pot.
        </p>

        <div className="mb-4 flex items-center justify-between rounded-md border border-edge bg-app px-4 py-3">
          <div>
            <p className="font-data text-2xl font-bold text-ink">{stats?.total_entries ?? 0}</p>
            <p className="text-xs text-muted">Entries signed up</p>
          </div>
          <div className="text-right">
            <p className="font-data text-sm font-semibold text-ink">
              {ENTRY_DEADLINE.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            <p className="text-xs text-muted">Entry deadline</p>
          </div>
        </div>

        {!deadlinePassed && (
          <div className="mb-4">
            <CountdownTimer target={ENTRY_DEADLINE.toISOString()} label="Entries close in" />
          </div>
        )}

        <Link
          href="/survivor"
          className="block rounded-md bg-gold-500 px-4 py-2.5 text-center text-sm font-semibold text-app transition hover:bg-gold-600"
        >
          Click here for more information or to enter
        </Link>
      </section>

      {/* Weekly Pick'em Pool section */}
      <section className="rounded-lg border border-edge bg-surface p-5 opacity-70">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-muted">
            Weekly Pick&apos;em Pool
          </h2>
          <span className="rounded-full bg-edge px-2 py-0.5 text-xs font-medium text-muted">
            Coming soon
          </span>
        </div>
        <p className="text-sm text-muted">
          Pick 6 games against the spread each week. Go 6-0 to win the pot. Full details coming
          soon.
        </p>
      </section>
    </main>
  );
}
