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

export async function createEntryAdmin(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const targetUserId = formData.get("userId") as string;
  const entryName = (formData.get("entryName") as string) || null;
  if (!targetUserId) {
    redirect("/admin/survivor/entries?error=" + encodeURIComponent("Pick a user"));
  }

  const { data: existing, error: existingErr } = await supabase
    .from("survivor_entries")
    .select("entry_number")
    .eq("user_id", targetUserId);
  if (existingErr) {
    redirect("/admin/survivor/entries?error=" + encodeURIComponent(existingErr.message));
  }
  if ((existing?.length ?? 0) >= 2) {
    redirect("/admin/survivor/entries?error=" + encodeURIComponent("That user already has 2 entries"));
  }
  const entryNumber = existing?.some((e) => e.entry_number === 1) ? 2 : 1;

  const { data: created, error } = await supabase
    .from("survivor_entries")
    .insert({ user_id: targetUserId, entry_number: entryNumber, entry_name: entryName })
    .select("id")
    .single();
  if (error) {
    redirect("/admin/survivor/entries?error=" + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "create_entry",
    "survivor_entries",
    created!.id,
    {},
    { user_id: targetUserId, entry_number: entryNumber, entry_name: entryName },
    "Manually created by admin (deadline not enforced for admin overrides)"
  );

  revalidatePath("/admin/survivor/entries");
  revalidatePath("/admin");
  redirect("/admin/survivor/entries?created=1");
}

export async function updateEntryAdmin(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const entryId = formData.get("entryId") as string;
  const entryName = (formData.get("entryName") as string) || null;
  const status = formData.get("status") as string;
  const eliminatedWeekRaw = formData.get("eliminatedWeekNumber") as string;
  const eliminatedWeekNumber =
    status === "eliminated" && eliminatedWeekRaw ? Number(eliminatedWeekRaw) : null;

  const { data: before, error: fetchErr } = await supabase
    .from("survivor_entries")
    .select("entry_name, status, eliminated_week_number")
    .eq("id", entryId)
    .single();
  if (fetchErr || !before) {
    redirect("/admin/survivor/entries?error=" + encodeURIComponent("Entry not found"));
  }

  const { error } = await supabase
    .from("survivor_entries")
    .update({ entry_name: entryName, status, eliminated_week_number: eliminatedWeekNumber })
    .eq("id", entryId);
  if (error) {
    redirect("/admin/survivor/entries?error=" + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "edit_entry",
    "survivor_entries",
    entryId,
    before!,
    { entry_name: entryName, status, eliminated_week_number: eliminatedWeekNumber },
    "Manually edited by admin"
  );

  revalidatePath("/admin/survivor/entries");
  revalidatePath("/admin/survivor/results");
  revalidatePath("/admin/survivor/bonus");
  revalidatePath("/admin");
  redirect("/admin/survivor/entries?updated=1");
}

export async function toggleDuesPaid(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const entryId = formData.get("entryId") as string;
  const nextValue = formData.get("nextValue") === "true";

  const { error } = await supabase
    .from("survivor_entries")
    .update({ dues_paid: nextValue, dues_paid_at: nextValue ? new Date().toISOString() : null })
    .eq("id", entryId);
  if (error) {
    redirect("/admin/survivor/entries?error=" + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "toggle_dues_paid",
    "survivor_entries",
    entryId,
    { dues_paid: !nextValue },
    { dues_paid: nextValue },
    nextValue ? "Marked dues paid" : "Marked dues unpaid"
  );

  revalidatePath("/admin/survivor/entries");
  redirect("/admin/survivor/entries");
}

export async function deleteEntryAdmin(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const entryId = formData.get("entryId") as string;

  const [{ data: entry }, { data: picks }] = await Promise.all([
    supabase.from("survivor_entries").select("*").eq("id", entryId).single(),
    supabase.from("survivor_picks").select("*").eq("entry_id", entryId),
  ]);
  if (!entry) {
    redirect("/admin/survivor/entries?error=" + encodeURIComponent("Entry not found"));
  }

  // survivor_picks_entry_id_fkey is ON DELETE CASCADE — deleting the entry
  // also deletes its picks, so a full snapshot goes into admin_actions
  // before that happens (survivor_picks_log has no FK to entry_id, so those
  // history rows survive, but the live picks themselves won't).
  const { error } = await supabase.from("survivor_entries").delete().eq("id", entryId);
  if (error) {
    redirect("/admin/survivor/entries?error=" + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "delete_entry",
    "survivor_entries",
    entryId,
    { entry, picks: picks ?? [] },
    {},
    `Deleted by admin — cascaded ${picks?.length ?? 0} pick(s)`
  );

  revalidatePath("/admin/survivor/entries");
  revalidatePath("/admin/survivor/bonus");
  revalidatePath("/admin");
  redirect("/admin/survivor/entries?deleted=1");
}
