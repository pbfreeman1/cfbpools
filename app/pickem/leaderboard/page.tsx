import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPickemLeaderboard } from "@/app/actions/pickem";
import LeaderboardTable from "./LeaderboardTable";

export default async function PickemLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ schedule_id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("current_week_id")
    .single();

  const scheduleId = params.schedule_id || appSettings?.current_week_id || "";

  if (!scheduleId) {
    return (
      <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl">
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          Season schedule not yet loaded.
        </p>
      </main>
    );
  }

  const [{ data: week }, rows] = await Promise.all([
    supabase.from("schedule").select("week_number, label").eq("id", scheduleId).single(),
    getPickemLeaderboard(scheduleId),
  ]);

  // A failed fetch on first load has nothing to fall back to — empty is a
  // reasonable default for a page that hasn't successfully loaded anything
  // yet. The polling path in LeaderboardTable is where a failure actually
  // matters, since there it would otherwise clobber already-good data.
  const initialRows = rows ?? [];

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl">
      <Link href="/pickem" className="mb-4 inline-block text-sm text-pickem-400 hover:underline">
        &larr; Pick&apos;em
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-pickem-400">
        Leaderboard
      </h1>
      <p className="mb-6 text-sm text-muted">
        {week ? `Week ${week.week_number}${week.label ? ` — ${week.label}` : ""}` : ""}
      </p>

      <LeaderboardTable scheduleId={scheduleId} initialRows={initialRows} />
    </main>
  );
}
