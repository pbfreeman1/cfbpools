"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/adminActions";

const PATH = "/admin/pickem/exclusions";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addRownumExclusion(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const rownumRaw = (formData.get("rownum") as string) ?? "";
  const note = ((formData.get("note") as string) ?? "").trim() || null;
  const rownum = Number(rownumRaw);

  if (!Number.isInteger(rownum) || rownum < 0) {
    redirect(`${PATH}?error=` + encodeURIComponent("Row number must be a whole number"));
  }

  const { error } = await supabase.from("pickem_rownum_exclusions").insert({ rownum, note });
  if (error) {
    // 23505 = unique_violation — rownum is the primary key.
    const message =
      error.code === "23505" ? "That row number is already excluded." : error.message;
    redirect(`${PATH}?error=` + encodeURIComponent(message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "add_pickem_rownum_exclusion",
    "pickem_rownum_exclusions",
    String(rownum),
    {},
    { rownum, active: true, note },
    "Pick'em exclusions — row number added"
  );

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function toggleRownumExclusion(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const rownumRaw = (formData.get("rownum") as string) ?? "";
  const rownum = Number(rownumRaw);
  if (!Number.isInteger(rownum)) {
    redirect(`${PATH}?error=` + encodeURIComponent("Missing row number"));
  }

  const { data: before, error: fetchErr } = await supabase
    .from("pickem_rownum_exclusions")
    .select("active")
    .eq("rownum", rownum)
    .single();
  if (fetchErr || !before) {
    redirect(`${PATH}?error=` + encodeURIComponent("Exclusion not found"));
  }

  const nextActive = !before!.active;
  const { error } = await supabase
    .from("pickem_rownum_exclusions")
    .update({ active: nextActive })
    .eq("rownum", rownum);
  if (error) {
    redirect(`${PATH}?error=` + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "toggle_pickem_rownum_exclusion",
    "pickem_rownum_exclusions",
    String(rownum),
    before!,
    { active: nextActive },
    `Pick'em exclusions — row ${rownum} set to ${nextActive ? "active" : "inactive"}`
  );

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function deleteRownumExclusion(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const rownumRaw = (formData.get("rownum") as string) ?? "";
  const rownum = Number(rownumRaw);
  if (!Number.isInteger(rownum)) {
    redirect(`${PATH}?error=` + encodeURIComponent("Missing row number"));
  }

  const { data: before } = await supabase
    .from("pickem_rownum_exclusions")
    .select("*")
    .eq("rownum", rownum)
    .single();

  const { error } = await supabase.from("pickem_rownum_exclusions").delete().eq("rownum", rownum);
  if (error) {
    redirect(`${PATH}?error=` + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "delete_pickem_rownum_exclusion",
    "pickem_rownum_exclusions",
    String(rownum),
    before ?? {},
    {},
    `Pick'em exclusions — row ${rownum} deleted`
  );

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function addEmailExclusion(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const email = ((formData.get("email") as string) ?? "").trim();
  const note = ((formData.get("note") as string) ?? "").trim() || null;

  if (!EMAIL_RE.test(email)) {
    redirect(`${PATH}?error=` + encodeURIComponent("Enter a valid email address"));
  }

  const { error } = await supabase.from("pickem_admin_emails").insert({ email, note });
  if (error) {
    // 23505 = unique_violation — email is the primary key.
    const message = error.code === "23505" ? "That email is already excluded." : error.message;
    redirect(`${PATH}?error=` + encodeURIComponent(message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "add_pickem_email_exclusion",
    "pickem_admin_emails",
    email,
    {},
    { email, active: true, note },
    "Pick'em exclusions — email added"
  );

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function toggleEmailExclusion(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const email = (formData.get("email") as string) ?? "";
  if (!email) {
    redirect(`${PATH}?error=` + encodeURIComponent("Missing email"));
  }

  const { data: before, error: fetchErr } = await supabase
    .from("pickem_admin_emails")
    .select("active")
    .eq("email", email)
    .single();
  if (fetchErr || !before) {
    redirect(`${PATH}?error=` + encodeURIComponent("Exclusion not found"));
  }

  const nextActive = !before!.active;
  const { error } = await supabase
    .from("pickem_admin_emails")
    .update({ active: nextActive })
    .eq("email", email);
  if (error) {
    redirect(`${PATH}?error=` + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "toggle_pickem_email_exclusion",
    "pickem_admin_emails",
    email,
    before!,
    { active: nextActive },
    `Pick'em exclusions — ${email} set to ${nextActive ? "active" : "inactive"}`
  );

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function deleteEmailExclusion(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const email = (formData.get("email") as string) ?? "";
  if (!email) {
    redirect(`${PATH}?error=` + encodeURIComponent("Missing email"));
  }

  const { data: before } = await supabase
    .from("pickem_admin_emails")
    .select("*")
    .eq("email", email)
    .single();

  const { error } = await supabase.from("pickem_admin_emails").delete().eq("email", email);
  if (error) {
    redirect(`${PATH}?error=` + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "delete_pickem_email_exclusion",
    "pickem_admin_emails",
    email,
    before ?? {},
    {},
    `Pick'em exclusions — ${email} deleted`
  );

  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}
