import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { updatePaymentInfo } from "@/app/actions/profile";
import { SEASON } from "@/lib/season";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; payment_saved?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, is_admin, payment_method, payment_handle")
    .eq("id", user.id)
    .single();

  const { data: entries } = await supabase
    .from("survivor_entries")
    .select("id, entry_number, entry_name, status, dues_paid")
    .eq("user_id", user.id)
    .order("entry_number");

  const { data: weeks } = await supabase
    .from("schedule")
    .select("id, week_number, start_date, end_date")
    .eq("season", SEASON)
    .order("week_number");

  const today = new Date();
  const currentWeek = (weeks ?? []).find(
    (w) => today >= new Date(w.start_date) && today <= new Date(w.end_date)
  );

  // "Pick needed" banner — same rule the /survivor grid uses: a week only
  // counts as locked once every SEC game that week has kicked off.
  const missingPickEntries: { id: string; name: string }[] = [];
  if (currentWeek && entries && entries.length > 0) {
    const entryIds = entries.map((e) => e.id);

    const [{ data: picks }, { data: games }] = await Promise.all([
      supabase
        .from("survivor_picks")
        .select("entry_id")
        .eq("schedule_id", currentWeek.id)
        .in("entry_id", entryIds),
      supabase
        .from("games")
        .select(
          `kickoff_time,
           home_team:master_teams!games_home_team_id_fkey(conference),
           away_team:master_teams!games_away_team_id_fkey(conference)`
        )
        .eq("schedule_id", currentWeek.id),
    ]);

    const secGames = (games ?? []).filter((g) => {
      const home = g.home_team as unknown as { conference: string };
      const away = g.away_team as unknown as { conference: string };
      return home.conference === "SEC" || away.conference === "SEC";
    });
    const weekLocked =
      secGames.length > 0 && secGames.every((g) => new Date(g.kickoff_time).getTime() <= Date.now());

    const pickedEntryIds = new Set((picks ?? []).map((p) => p.entry_id));

    entries.forEach((e) => {
      if (e.status === "active" && !pickedEntryIds.has(e.id) && !weekLocked) {
        missingPickEntries.push({ id: e.id, name: e.entry_name || `Entry ${e.entry_number}` });
      }
    });
  }

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl">
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        You&apos;re in{profile?.first_name ? `, ${profile.first_name}` : ""}.
      </h1>
      <p className="mb-1 text-sm text-muted">{user.email}</p>
      {profile?.is_admin && (
        <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gold-400">Admin</p>
      )}

      {params.error && (
        <p className="mt-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}

      {missingPickEntries.length > 0 && currentWeek && (
        <div className="mt-6 rounded-md border border-gold-500 bg-gold-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-gold-400">
            {missingPickEntries.length === 1
              ? `${missingPickEntries[0].name} hasn't picked for Week ${currentWeek.week_number} yet.`
              : `${missingPickEntries.length} entries haven't picked for Week ${currentWeek.week_number} yet.`}
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            {missingPickEntries.map((e) => (
              <Link
                key={e.id}
                href={`/survivor/${e.id}?week=${currentWeek.week_number}`}
                className="text-sm font-medium text-gold-400 hover:underline"
              >
                Pick now for {e.name} &rarr;
              </Link>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
        Payment method
      </h2>
      <p className="mb-3 text-xs text-muted">
        Used to validate your entries across all CFBPools contests — pool-specific fees are
        shown on each pool&apos;s own entry page.
      </p>
      {params.payment_saved === "1" && (
        <p className="mb-3 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">Payment info saved.</p>
      )}
      <form action={updatePaymentInfo} className="mb-8 flex flex-col gap-3">
        <div>
          <label htmlFor="paymentMethod" className="mb-1 block text-sm font-medium text-ink">
            Preferred method
          </label>
          <select
            id="paymentMethod"
            name="paymentMethod"
            defaultValue={profile?.payment_method || "venmo"}
            className="w-full rounded-md border border-edge bg-app px-3 py-2 text-base text-ink focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          >
            <option value="venmo">Venmo</option>
            <option value="paypal">PayPal</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label htmlFor="paymentHandle" className="mb-1 block text-sm font-medium text-ink">
            Handle / username
          </label>
          <input
            id="paymentHandle"
            name="paymentHandle"
            type="text"
            defaultValue={profile?.payment_handle || ""}
            placeholder="@yourhandle"
            className="w-full rounded-md border border-edge bg-app px-3 py-2 text-base text-ink placeholder:text-muted focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
        <button
          type="submit"
          className="mt-1 rounded-md border border-edge px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
        >
          Save payment info
        </button>
      </form>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">My Pools</h2>
      <div className="mb-8 rounded-lg border border-edge bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-ink">
            SEC Survivor Pool
          </p>
          <Link href="/survivor" className="text-xs font-medium text-gold-400 hover:underline">
            Pool home &rarr;
          </Link>
        </div>
        {!entries || entries.length === 0 ? (
          <div>
            <p className="mb-3 text-sm text-muted">You don&apos;t have a Survivor entry yet.</p>
            <Link
              href="/survivor/new"
              className="inline-block rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600"
            >
              Create an entry
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-edge">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {entry.entry_name || `Entry ${entry.entry_number}`}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs">
                    <span
                      className={
                        entry.status === "eliminated"
                          ? "font-medium text-dead"
                          : "font-medium text-alive"
                      }
                    >
                      {entry.status === "eliminated" ? "Eliminated" : "Alive"}
                    </span>
                    <span className="text-muted">&middot;</span>
                    <span className={entry.dues_paid ? "text-alive" : "text-muted"}>
                      {entry.dues_paid ? "Dues paid" : "Dues not marked paid"}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/survivor/${entry.id}`}
                  className="flex-shrink-0 rounded-md border border-edge px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-hover"
                >
                  View entry
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <form action={signOut}>
        <button
          type="submit"
          className="w-full rounded-md border border-edge px-4 py-2.5 text-base font-medium text-ink transition hover:bg-surface-hover"
        >
          Log out
        </button>
      </form>
    </main>
  );
}
