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
