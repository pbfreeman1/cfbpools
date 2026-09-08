import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PickCellData } from "@/app/survivor/PickCell";
import LockedPicksList, { type LockedWeek, type LockedRow } from "./LockedPicksList";

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
       team_name, team_short_name, team_logo_url, team_primary_color,
       is_bonus_week, bonus_team_id,
       bonus_team_name, bonus_team_short_name, bonus_team_logo_url, bonus_team_primary_color`
    )
    .order("week_number", { ascending: false });

  const byWeek = new Map<number, LockedRow[]>();
  (rows ?? []).forEach((r) => {
    const pick: PickCellData = {
      shortName: r.team_short_name || r.team_name || "—",
      logoUrl: r.team_logo_url,
      color: r.team_primary_color,
      isBonus: r.is_bonus_week && !!r.bonus_team_id,
      bonusShortName: r.bonus_team_short_name || r.bonus_team_name,
      bonusLogoUrl: r.bonus_team_logo_url,
      bonusColor: r.bonus_team_primary_color,
    };
    const list = byWeek.get(r.week_number) ?? [];
    list.push({
      entryId: r.entry_id,
      entryName: r.entry_name || "Entry",
      eliminated: r.entry_status === "eliminated",
      pick,
    });
    byWeek.set(r.week_number, list);
  });

  // Alive entries first, then eliminated; alphabetical by entry name within
  // each group.
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  const weeks: LockedWeek[] = Array.from(byWeek.keys())
    .sort((a, b) => b - a)
    .map((weekNumber) => ({
      weekNumber,
      rows: byWeek.get(weekNumber)!.sort((a, b) => {
        if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
        return collator.compare(a.entryName, b.entryName);
      }),
    }));

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl lg:max-w-5xl">
      <Link href="/survivor" className="mb-4 inline-block text-sm text-gold-400 hover:underline">
        &larr; Back to entries
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        Locked picks
      </h1>
      <p className="mb-6 text-sm text-muted">
        Only shows picks once that week&apos;s game has kicked off.
      </p>

      <LockedPicksList weeks={weeks} />
    </main>
  );
}
