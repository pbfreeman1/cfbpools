"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { computeEliminations, buildTeamResultMap, type SurvivorPick, type GameResult } from "@/lib/survivorElimination";
import { requireAdmin } from "@/lib/adminAuth";
import type { createClient } from "@/lib/supabase/server";

async function logAdminAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminId: string,
  action: string,
  targetTable: string,
  targetId: string,
  previousValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
  note: string
) {
  const { error } = await supabase.from("admin_actions").insert({
    admin_id: adminId,
    action,
    target_table: targetTable,
    target_id: targetId,
    previous_value: previousValue,
    new_value: newValue,
    note,
  });
  if (error) {
    // The status change itself already succeeded — losing the audit row
    // shouldn't roll that back, but it must not be silent either.
    console.error(`[admin_actions] Failed to log ${action} for ${targetId}:`, error.message);
  }
}

export async function commitWeekResults(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const scheduleId = formData.get("scheduleId") as string;
  if (!scheduleId) {
    redirect("/admin/survivor/results?error=" + encodeURIComponent("Missing week reference"));
  }

  const { data: week, error: weekErr } = await supabase
    .from("schedule")
    .select("week_number")
    .eq("id", scheduleId)
    .single();
  if (weekErr || !week) {
    redirect("/admin/survivor/results?error=" + encodeURIComponent("Could not load that week"));
  }
  const weekNumber = week!.week_number;

  const { data: games, error: gamesErr } = await supabase
    .from("games")
    .select("id, status, home_team_id, away_team_id, home_score, away_score")
    .eq("schedule_id", scheduleId);
  if (gamesErr) {
    redirect("/admin/survivor/results?error=" + encodeURIComponent(gamesErr.message));
  }

  const settledGames: GameResult[] = [];

  for (const game of games ?? []) {
    let status = game.status;
    let homeScore = game.home_score;
    let awayScore = game.away_score;

    // Only apply the admin's manual winner selection to games that aren't
    // already final — a synced/real result is never overwritten by this
    // form, even if a stray submission includes it.
    if (status !== "final") {
      const submittedWinner = formData.get(`game_${game.id}`) as string | null;
      if (submittedWinner === game.home_team_id || submittedWinner === game.away_team_id) {
        status = "final";
        const homeWon = submittedWinner === game.home_team_id;
        // Nominal placeholder score — Survivor only cares who won. The next
        // CFBD sync overwrites this with the real score on its normal upsert.
        homeScore = homeWon ? 1 : 0;
        awayScore = homeWon ? 0 : 1;

        const { error: updateErr } = await supabase
          .from("games")
          .update({ status, home_score: homeScore, away_score: awayScore })
          .eq("id", game.id);
        if (updateErr) {
          redirect("/admin/survivor/results?error=" + encodeURIComponent(updateErr.message));
        }
      }
    }

    settledGames.push({
      id: game.id,
      status,
      homeScore,
      awayScore,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
    });
  }

  // Overrides are already baked into settledGames' status/scores above, so
  // this reuses the exact same map-building logic as the preview with no
  // further overrides to apply.
  const teamResult = buildTeamResultMap(settledGames, new Map());

  const { data: pickRows, error: picksErr } = await supabase
    .from("survivor_picks")
    .select(
      `entry_id, team_id, bonus_team_id, is_bonus_week,
       entry:survivor_entries!survivor_picks_entry_id_fkey(id, entry_name, entry_number, status)`
    )
    .eq("schedule_id", scheduleId);
  if (picksErr) {
    redirect("/admin/survivor/results?error=" + encodeURIComponent(picksErr.message));
  }

  const picks: SurvivorPick[] = (pickRows ?? [])
    .filter((p) => {
      const entry = p.entry as unknown as { status: string } | null;
      return entry?.status === "active";
    })
    .map((p) => {
      const entry = p.entry as unknown as { id: string; entry_name: string | null; entry_number: number };
      return {
        entryId: entry.id,
        entryName: entry.entry_name || `Entry ${entry.entry_number}`,
        isBonusWeek: p.is_bonus_week,
        teamId: p.team_id,
        bonusTeamId: p.bonus_team_id,
      };
    });

  const { eliminations } = computeEliminations(picks, teamResult, weekNumber);

  let eliminatedCount = 0;
  for (const elim of eliminations) {
    const { error: updateErr } = await supabase
      .from("survivor_entries")
      .update({ status: "eliminated", eliminated_week_number: weekNumber })
      .eq("id", elim.entryId)
      .eq("status", "active"); // guard against double-processing a re-submit

    if (updateErr) {
      console.error(`[commitWeekResults] Failed to eliminate ${elim.entryId}:`, updateErr.message);
      continue;
    }

    eliminatedCount++;
    await logAdminAction(
      supabase,
      user.id,
      "eliminate_entry",
      "survivor_entries",
      elim.entryId,
      { status: "active" },
      { status: "eliminated", eliminated_week_number: weekNumber },
      elim.reason
    );
  }

  revalidatePath("/admin/survivor/results");
  revalidatePath("/admin/survivor/entries");
  revalidatePath("/admin");
  redirect(`/admin/survivor/results?committed=${eliminatedCount}`);
}

export async function reinstateEntry(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const entryId = formData.get("entryId") as string;
  if (!entryId) {
    redirect("/admin/survivor/results?error=" + encodeURIComponent("Missing entry id"));
  }

  const { data: entry, error: fetchErr } = await supabase
    .from("survivor_entries")
    .select("status, eliminated_week_number")
    .eq("id", entryId)
    .single();
  if (fetchErr || !entry) {
    redirect("/admin/survivor/results?error=" + encodeURIComponent("Entry not found"));
  }

  const { error: updateErr } = await supabase
    .from("survivor_entries")
    .update({ status: "active", eliminated_week_number: null })
    .eq("id", entryId);
  if (updateErr) {
    redirect("/admin/survivor/results?error=" + encodeURIComponent(updateErr.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "reinstate_entry",
    "survivor_entries",
    entryId,
    { status: entry!.status, eliminated_week_number: entry!.eliminated_week_number },
    { status: "active", eliminated_week_number: null },
    "Manually reinstated by admin"
  );

  revalidatePath("/admin/survivor/results");
  revalidatePath("/admin/survivor/entries");
  revalidatePath("/admin");
  redirect("/admin/survivor/results?reinstated=1");
}
