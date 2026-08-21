"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";

export async function triggerSync(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  // Callable from any admin page (system page, Pickem week setup, etc.) — the
  // caller passes a hidden `returnTo` so the confirmation lands back where
  // the sync was kicked off from, defaulting to the system page.
  const returnTo = (formData.get("returnTo") as string) || "/admin/system";
  const sep = returnTo.includes("?") ? "&" : "?";

  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("current_season")
    .single();

  const { data, error } = await supabase.functions.invoke("cfbd-sync", {
    body: { year: appSettings?.current_season, triggered_by: user.id },
  });

  revalidatePath("/admin/system");
  revalidatePath("/admin/pickem/week");
  revalidatePath("/admin");

  if (error) {
    redirect(`${returnTo}${sep}error=` + encodeURIComponent(error.message));
  }
  if (data?.error) {
    redirect(`${returnTo}${sep}error=` + encodeURIComponent(data.error));
  }

  redirect(
    `${returnTo}${sep}synced=` +
      encodeURIComponent(
        `${data?.gamesSynced ?? 0} games, ${data?.teamsSynced ?? 0} teams, ${data?.linesSynced ?? 0} lines`
      )
  );
}
