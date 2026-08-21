"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/adminActions";

export async function updatePickemGame(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const gameId = formData.get("gameId") as string;
  const scheduleId = formData.get("scheduleId") as string;
  const pickemSelected = formData.get("pickemSelected") === "on";
  const spreadRaw = (formData.get("spreadOverride") as string) ?? "";
  const spreadOverride = spreadRaw.trim() === "" ? null : Number(spreadRaw);

  if (!gameId || !scheduleId) {
    redirect("/admin/pickem/week?error=" + encodeURIComponent("Missing game reference"));
  }
  if (spreadOverride !== null && Number.isNaN(spreadOverride)) {
    redirect(
      `/admin/pickem/week?schedule_id=${scheduleId}&error=` + encodeURIComponent("Invalid spread value")
    );
  }

  const { data: before, error: fetchErr } = await supabase
    .from("games")
    .select("pickem_selected, pickem_spread_override")
    .eq("id", gameId)
    .single();
  if (fetchErr || !before) {
    redirect(
      `/admin/pickem/week?schedule_id=${scheduleId}&error=` + encodeURIComponent("Game not found")
    );
  }

  const { error } = await supabase
    .from("games")
    .update({ pickem_selected: pickemSelected, pickem_spread_override: spreadOverride })
    .eq("id", gameId);
  if (error) {
    redirect(`/admin/pickem/week?schedule_id=${scheduleId}&error=` + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "update_pickem_game",
    "games",
    gameId,
    before!,
    { pickem_selected: pickemSelected, pickem_spread_override: spreadOverride },
    "Pick'em week setup — game selection/spread updated"
  );

  revalidatePath("/admin/pickem/week");
  redirect(`/admin/pickem/week?schedule_id=${scheduleId}&saved=1`);
}

// The same lock-on-selection rule the individual row Save applies (the form's
// spread field defaults to the effective spread — override if set, else the
// current CFBD value — so saving with no prior override freezes it to
// whatever CFBD shows right now). Shared here so bulk selection can't drift
// from that rule.
function lockedSpreadOnSelect(currentOverride: number | null, homeSpread: number | null) {
  return currentOverride ?? homeSpread;
}

export async function bulkSetPickemSelection(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const scheduleId = formData.get("scheduleId") as string;
  const selected = formData.get("selected") === "true";
  if (!scheduleId) {
    redirect("/admin/pickem/week?error=" + encodeURIComponent("Missing week reference"));
  }

  const { data: weekGames, error: fetchErr } = await supabase
    .from("games")
    .select("id, home_spread, pickem_spread_override")
    .eq("schedule_id", scheduleId);
  if (fetchErr) {
    redirect(
      `/admin/pickem/week?schedule_id=${scheduleId}&error=` + encodeURIComponent(fetchErr.message)
    );
  }

  let affected = 0;
  for (const g of weekGames ?? []) {
    // Clearing never touches pickem_spread_override — whether a game is in
    // the pool and whether its spread is locked are separate concerns.
    const nextOverride = selected ? lockedSpreadOnSelect(g.pickem_spread_override, g.home_spread) : g.pickem_spread_override;

    const { error } = await supabase
      .from("games")
      .update({ pickem_selected: selected, pickem_spread_override: nextOverride })
      .eq("id", g.id);
    if (error) {
      redirect(
        `/admin/pickem/week?schedule_id=${scheduleId}&error=` + encodeURIComponent(error.message)
      );
    }
    affected++;
  }

  await logAdminAction(
    supabase,
    user.id,
    selected ? "bulk_select_pickem_games" : "bulk_clear_pickem_games",
    "games",
    scheduleId,
    {},
    { scheduleId, selected, gamesAffected: affected },
    selected
      ? `Selected all ${affected} game(s) for Pick'em this week — any unset spread was locked to its current CFBD value`
      : `Cleared Pick'em selection for all ${affected} game(s) this week — spread overrides left untouched`
  );

  revalidatePath("/admin/pickem/week");
  redirect(`/admin/pickem/week?schedule_id=${scheduleId}&saved=1`);
}

export async function clearPickemSpreadOverride(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const gameId = formData.get("gameId") as string;
  const scheduleId = formData.get("scheduleId") as string;
  if (!gameId || !scheduleId) {
    redirect("/admin/pickem/week?error=" + encodeURIComponent("Missing game reference"));
  }

  const { data: before } = await supabase
    .from("games")
    .select("pickem_spread_override")
    .eq("id", gameId)
    .single();

  const { error } = await supabase
    .from("games")
    .update({ pickem_spread_override: null })
    .eq("id", gameId);
  if (error) {
    redirect(`/admin/pickem/week?schedule_id=${scheduleId}&error=` + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "clear_pickem_spread_override",
    "games",
    gameId,
    before ?? {},
    { pickem_spread_override: null },
    "Pick'em week setup — cleared spread override, reverted to CFBD-synced value"
  );

  revalidatePath("/admin/pickem/week");
  redirect(`/admin/pickem/week?schedule_id=${scheduleId}&saved=1`);
}
