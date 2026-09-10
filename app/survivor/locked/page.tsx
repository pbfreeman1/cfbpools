import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LockedPicksList, { type LockedEntry, type LockedPick } from "./LockedPicksList";

export default async function LockedPicksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  // Alive entries first, then eliminated; alphabetical by entry name within
  // each group.
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  const entries: LockedEntry[] = Array.from(byEntry.values()).sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    return collator.compare(a.entryName, b.entryName);
  });

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

      <LockedPicksList weekNumbers={weekNumbers} entries={entries} />
    </main>
  );
}
