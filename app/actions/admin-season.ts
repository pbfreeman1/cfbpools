"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";

export async function updateAppSettings(formData: FormData) {
  const { supabase } = await requireAdmin();

  const currentSeason = Number(formData.get("current_season"));
  const currentWeekId = (formData.get("current_week_id") as string) || null;
  const seasonPhase = formData.get("season_phase") as string;
  const survivorSignupsOpen = formData.get("survivor_signups_open") === "on";
  const pickemSignupsOpen = formData.get("pickem_signups_open") === "on";

  if (!currentSeason || Number.isNaN(currentSeason)) {
    redirect("/admin/season?error=" + encodeURIComponent("Season must be a number"));
  }

  // updated_at / updated_by are set automatically by trg_app_settings_meta —
  // never set those columns here.
  const { error } = await supabase
    .from("app_settings")
    .update({
      current_season: currentSeason,
      current_week_id: currentWeekId,
      season_phase: seasonPhase,
      survivor_signups_open: survivorSignupsOpen,
      pickem_signups_open: pickemSignupsOpen,
    })
    .eq("id", true);

  if (error) {
    redirect("/admin/season?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/admin/season");
  revalidatePath("/admin");
  revalidatePath("/admin/survivor/results");
  revalidatePath("/survivor");
  redirect("/admin/season?saved=1");
}
