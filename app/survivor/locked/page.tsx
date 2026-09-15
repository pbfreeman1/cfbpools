import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SEASON } from "@/lib/season";
import LockedPicksList, { type LockedEntry, type LockedPick } from "./LockedPicksList";
import WeekFilterPills from "./WeekFilterPills";
import WeeklyPickCountChart, { type WeekPickCountRow } from "./WeeklyPickCountChart";

export default async function LockedPicksPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Current week = the schedule row whose [start_date, end_date) span
  // contains today. Half-open on purpose: consecutive weeks' start/end
  // dates overlap by a day, so a same-day-inclusive check on both ends
  // would match two weeks at once.
  const { data: weeks } = await supabase
    .from("schedule")
    .select("week_number, start_date, end_date")
    .eq("season", SEASON)
    .order("week_number");

  const todayStr = new Date().toISOString().slice(0, 10);
  const currentWeekRow =
    (weeks ?? []).find((w) => todayStr >= w.start_date && todayStr < w.end_date) ??
    (weeks ?? []).find((w) => todayStr < w.start_date) ??
    (weeks ?? [])[(weeks?.length ?? 1) - 1];
  const currentWeekNumber = currentWeekRow?.week_number ?? 1;

  const selectableWeeks = Array.from({ length: currentWeekNumber }, (_, i) => i + 1);
  const requestedWeek = parseInt(params.week ?? "", 10);
  const selectedWeek = selectableWeeks.includes(requestedWeek) ? requestedWeek : currentWeekNumber;

  const { data: pickCountRows } = await supabase
    .from("survivor_week_pick_counts")
    .select(
      `team_id, school_name, short_name, primary_color, logo_url,
       kickoff_time, game_started, pick_count, bonus_pick_count, total_pick_count`
    )
    .eq("season", SEASON)
    .eq("week_number", selectedWeek);

  // survivor_picks_locked is owner-privileged and only surfaces a pick once
  // one of its teams' games has kicked off — the pre-lock privacy rule lives
  // in the view's WHERE clause, so this page never has to guard it itself.
  const { data: rows } = await supabase
    .from("survivor_picks_locked")
    .select(
      `entry_id, entry_name, entry_status, week_number,
       team_name, team_short_name, team_logo_url,
       is_bonus_week, bonus_team_id,
       bonus_team_name, bonus_team_short_name, bonus_team_logo_url`
    )
    .order("week_number", { ascending: true });

  // Weeks that have at least one locked pick anywhere in the pool — these
  // become the table's columns, ascending so Week 1 sits next to the entry
  // name.
  const weekNumbers = Array.from(
    new Set((rows ?? []).map((r) => r.week_number as number))
  ).sort((a, b) => a - b);

  // Regroup by entry: each entry is one row, its picks keyed by week.
  const byEntry = new Map<string, LockedEntry>();
  (rows ?? []).forEach((r) => {
    let entry = byEntry.get(r.entry_id);
    if (!entry) {
      entry = {
        entryId: r.entry_id,
        entryName: r.entry_name || "Entry",
        ownerName: null,
        bonusFinalizedCount: 0,
        eliminated: r.entry_status === "eliminated",
        picksByWeek: {},
      };
      byEntry.set(r.entry_id, entry);
    }
    const pick: LockedPick = {
      shortName: r.team_short_name || r.team_name || "—",
      logoUrl: r.team_logo_url,
      isBonus: r.is_bonus_week && !!r.bonus_team_id,
      bonusShortName: r.bonus_team_short_name || r.bonus_team_name,
      bonusLogoUrl: r.bonus_team_logo_url,
    };
    entry.picksByWeek[r.week_number] = pick;
  });

  const entryIds = Array.from(byEntry.keys());

  // Owner display name ("John D.") — joined separately since
  // survivor_picks_locked doesn't carry user_id.
  if (entryIds.length > 0) {
    const { data: ownerRows } = await supabase
      .from("survivor_entries")
      .select("id, profiles:profiles!survivor_entries_user_id_fkey(first_name, last_name)")
      .in("id", entryIds);
    const owners = (ownerRows ?? []) as unknown as {
      id: string;
      profiles: { first_name: string | null; last_name: string | null } | null;
    }[];
    owners.forEach((r) => {
      const owner = r.profiles;
      const first = owner?.first_name?.trim();
      const lastInitial = owner?.last_name?.trim()?.[0];
      if (!first) return;
      const entry = byEntry.get(r.id);
      if (entry) entry.ownerName = lastInitial ? `${first} ${lastInitial}.` : first;
    });
  }

  // Finalized bonus-pick count per entry — only weeks that have already
  // ended count; the current/future weeks' bonus picks are still pending.
  const { data: bonusRows } = await supabase
    .from("survivor_bonus_picks")
    .select("entry_id, schedule!inner(end_date)")
    .lt("schedule.end_date", new Date().toISOString());
  (bonusRows ?? []).forEach((r) => {
    const entry = byEntry.get(r.entry_id);
    if (entry) entry.bonusFinalizedCount += 1;
  });

  // Alive entries first, then eliminated; alphabetical by entry name within
  // each group.
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  const entries: LockedEntry[] = Array.from(byEntry.values()).sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    return collator.compare(a.entryName, b.entryName);
  });

  const { count: totalActiveEntries } = await supabase
    .from("survivor_entries")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl lg:max-w-5xl">
      <Link href="/survivor" className="mb-4 inline-block text-sm text-gold-400 hover:underline">
        &larr; Back to entries
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        Locked picks
      </h1>
      <p className="mb-6 text-sm text-muted">
        Each pick appears once that week&apos;s game has kicked off. A split cell is a bonus
        week &mdash; both teams had to win.
      </p>

      <div>
        <WeekFilterPills
          weekNumbers={selectableWeeks}
          selectedWeek={selectedWeek}
          currentWeek={currentWeekNumber}
        />
        <WeeklyPickCountChart
          weekNumber={selectedWeek}
          rows={(pickCountRows ?? []) as WeekPickCountRow[]}
        />
      </div>

      <LockedPicksList
        weekNumbers={weekNumbers}
        entries={entries}
        totalActiveEntries={totalActiveEntries ?? 0}
      />
    </main>
  );
}
