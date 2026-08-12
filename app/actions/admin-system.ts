"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";

export async function triggerSync() {
  const { supabase, user } = await requireAdmin();

  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("current_season")
    .single();

  const { data, error } = await supabase.functions.invoke("cfbd-sync", {
    body: { year: appSettings?.current_season, triggered_by: user.id },
  });

  revalidatePath("/admin/system");
  revalidatePath("/admin");

  if (error) {
    redirect("/admin/system?error=" + encodeURIComponent(error.message));
  }
  if (data?.error) {
    redirect("/admin/system?error=" + encodeURIComponent(data.error));
  }

  redirect(
    "/admin/system?synced=" +
      encodeURIComponent(`${data?.gamesSynced ?? 0} games, ${data?.teamsSynced ?? 0} teams`)
  );
}
