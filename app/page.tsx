import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ENTRY_DEADLINE } from "@/lib/season";
import { formatDeadline } from "@/lib/formatDate";
import CountdownTimer from "@/app/components/CountdownTimer";
import LogoMosaic from "@/app/components/LogoMosaic";
import PoolCardsScroller from "@/app/components/PoolCardsScroller";

export default async function Home() {
  const supabase = await createClient();

  const { data: stats } = await supabase.from("survivor_pool_stats").select("*").single();
  const deadlinePassed = new Date() > ENTRY_DEADLINE;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let entryCount = 0;
  if (user) {
    const { count } = await supabase
      .from("survivor_entries")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    entryCount = count ?? 0;
  }

  const survivorCtaLabel =
    entryCount >= 2
      ? "Make This Week's Picks"
      : entryCount === 1
        ? "Add a Second Entry"
        : "Enter the Survivor Pool";

  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("current_week_id")
    .single();

  let hasPickemEntry = false;
  let pickemWeekNumber: number | null = null;
  let pickemEcount = 0;
  if (appSettings?.current_week_id) {
    const [{ data: pickemWeek }, { data: ecountRow }] = await Promise.all([
      supabase
        .from("schedule")
        .select("week_number")
        .eq("id", appSettings.current_week_id)
        .single(),
      supabase
        .from("pickem_week_ecount")
        .select("ecount")
        .eq("schedule_id", appSettings.current_week_id)
        .maybeSingle(),
    ]);
    pickemWeekNumber = pickemWeek?.week_number ?? null;
    pickemEcount = ecountRow?.ecount ?? 0;

    if (user) {
      const { count } = await supabase
        .from("pickem_entries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("schedule_id", appSettings.current_week_id);
      hasPickemEntry = (count ?? 0) > 0;
    }
  }

  const pickemCtaLabel = hasPickemEntry
    ? `Week ${pickemWeekNumber ?? ""} Pick'em Home`.trim()
    : "Enter the Pick'em Pool";

  return (
    <main className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-app">
      <LogoMosaic conference="SEC" />
      {/* Continuous scrim so the collage stays a visible texture without
          fighting the masthead/subhead for contrast. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-app/75 via-app/25 to-app/80" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12 sm:px-10">
        {/* Masthead */}
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <h1 className="font-display text-[clamp(3.25rem,15vw,9rem)] font-bold uppercase leading-[0.9] tracking-tight text-ink drop-shadow-[0_8px_30px_rgba(0,0,0,0.55)]">
            CFB<span className="text-gold-400">Pools</span>
          </h1>
        </div>

        {/* Pool cards */}
        <div className="pb-4">
          <PoolCardsScroller>
            {/* SEC Survivor Pool */}
            <section className="relative flex h-full flex-col overflow-hidden rounded-xl border-2 border-gold-500/50 bg-surface/95 p-6 shadow-[0_0_50px_-15px_rgba(245,185,66,0.4)] backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-ink">
                  SEC Survivor Pool
                </h2>
                <span className="rounded-full bg-alive/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-alive">
                  Open
                </span>
              </div>
              <p className="mb-5 text-sm text-muted">
                Pick one SEC team to win each week. Lose and you&apos;re out. Last one standing
                wins the pot.
              </p>

              <div className="mb-5 flex items-end justify-between rounded-lg border border-edge bg-app px-4 py-4">
                <div>
                  <p className="font-data text-4xl font-black leading-none tabular-nums text-ink sm:text-5xl">
                    {stats?.total_entries ?? 0}
                  </p>
                  <p className="mt-1.5 font-display text-[10px] uppercase tracking-[0.15em] text-muted">
                    Entries signed up
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-data text-lg font-bold leading-none text-ink sm:text-xl">
                    {formatDeadline(ENTRY_DEADLINE)}
                  </p>
                  <p className="mt-1.5 font-display text-[10px] uppercase tracking-[0.15em] text-muted">
                    Entry deadline
                  </p>
                </div>
              </div>

              {!deadlinePassed && (
                <div className="mb-5">
                  <CountdownTimer target={ENTRY_DEADLINE.toISOString()} label="Entries close in" />
                </div>
              )}

              <Link
                href="/survivor"
                className="mt-auto block rounded-lg bg-gold-500 px-6 py-4 text-center font-display text-base font-bold uppercase tracking-wide text-app shadow-lg shadow-gold-500/20 transition hover:bg-gold-600 hover:shadow-gold-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {survivorCtaLabel}
              </Link>
            </section>

            {/* Weekly Pick'em Pool */}
            <section className="relative flex h-full flex-col overflow-hidden rounded-xl border-2 border-pickem-500/35 bg-surface/95 p-6 shadow-[0_0_50px_-15px_rgba(76,126,255,0.3)] backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-ink">
                  Weekly Pick&apos;em Pool
                </h2>
                <span className="rounded-full bg-alive/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-alive">
                  Open
                </span>
              </div>
              <p className="mb-5 text-sm text-muted">
                Pick 6 games against the spread each week. Go 6-0 to win the pot.
              </p>

              <div className="mb-5 flex items-end justify-between rounded-lg border border-edge bg-app px-4 py-4">
                <div>
                  <p className="font-data text-4xl font-black leading-none tabular-nums text-ink sm:text-5xl">
                    {pickemEcount}
                  </p>
                  <p className="mt-1.5 font-display text-[10px] uppercase tracking-[0.15em] text-muted">
                    Total Entries This Week
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-data text-lg font-bold leading-none text-ink sm:text-xl">
                    Unlimited Entries
                  </p>
                  <p className="mt-1.5 font-display text-[10px] uppercase tracking-[0.15em] text-muted">
                    Enter as many as you like
                  </p>
                </div>
              </div>

              <Link
                href="/pickem"
                className="mt-auto block rounded-lg bg-pickem-500 px-6 py-4 text-center font-display text-base font-bold uppercase tracking-wide text-app shadow-lg shadow-pickem-500/20 transition hover:bg-pickem-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pickem-300 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {pickemCtaLabel}
              </Link>
            </section>
          </PoolCardsScroller>
        </div>
      </div>
    </main>
  );
}
