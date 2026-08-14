"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/adminActions";

export async function toggleIsAdmin(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const targetUserId = formData.get("userId") as string;
  const nextValue = formData.get("nextValue") === "true";

  if (targetUserId === user.id) {
    redirect("/admin/users?error=" + encodeURIComponent("Can't change your own admin status"));
  }

  const { error } = await supabase.from("profiles").update({ is_admin: nextValue }).eq("id", targetUserId);
  if (error) {
    redirect("/admin/users?error=" + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "toggle_admin",
    "profiles",
    targetUserId,
    { is_admin: !nextValue },
    { is_admin: nextValue },
    nextValue ? "Granted admin" : "Revoked admin"
  );

  revalidatePath("/admin/users");
  redirect("/admin/users");
}
