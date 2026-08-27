"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import { logAdminAction } from "@/lib/adminActions";

const LIST_PATH = "/admin/pickem/entries";

export async function renamePickemEntryAdmin(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const entryId = formData.get("entryId") as string;
  const entryName = ((formData.get("entryName") as string) ?? "").trim();
  if (!entryId || !entryName) {
    redirect(`${LIST_PATH}?error=` + encodeURIComponent("Entry name is required"));
  }

  const { data: before, error: fetchErr } = await supabase
    .from("pickem_entries")
    .select("entry_name")
    .eq("id", entryId)
    .single();
  if (fetchErr || !before) {
    redirect(`${LIST_PATH}?error=` + encodeURIComponent("Entry not found"));
  }

  const { error } = await supabase
    .from("pickem_entries")
    .update({ entry_name: entryName })
    .eq("id", entryId);
  if (error) {
    // 23505 = unique_violation (pickem_entries_unique_name_per_week).
    const message =
      error.code === "23505" ? "That entry name is already taken for this week." : error.message;
    redirect(`${LIST_PATH}?error=` + encodeURIComponent(message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "rename_pickem_entry",
    "pickem_entries",
    entryId,
    before!,
    { entry_name: entryName },
    "Pick'em entries — renamed by admin"
  );

  revalidatePath(LIST_PATH);
  revalidatePath(`/admin/pickem/entries/${entryId}`);
  redirect(`${LIST_PATH}?updated=1`);
}

export async function deletePickemEntryAdmin(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const entryId = formData.get("entryId") as string;
  if (!entryId) {
    redirect(`${LIST_PATH}?error=` + encodeURIComponent("Missing entry reference"));
  }

  const [{ data: entry }, { data: picks }] = await Promise.all([
    supabase.from("pickem_entries").select("*").eq("id", entryId).single(),
    supabase.from("pickem_picks").select("*").eq("entry_id", entryId),
  ]);
  if (!entry) {
    redirect(`${LIST_PATH}?error=` + encodeURIComponent("Entry not found"));
  }

  // pickem_picks_entry_id_fkey is ON DELETE CASCADE — deleting the entry
  // also deletes its picks, so a full snapshot goes into admin_actions
  // before that happens.
  const { error } = await supabase.from("pickem_entries").delete().eq("id", entryId);
  if (error) {
    redirect(`${LIST_PATH}?error=` + encodeURIComponent(error.message));
  }

  await logAdminAction(
    supabase,
    user.id,
    "delete_pickem_entry",
    "pickem_entries",
    entryId,
    { entry, picks: picks ?? [] },
    {},
    "Pick'em entries — deleted by admin (picks cascade-deleted)"
  );

  revalidatePath(LIST_PATH);
  redirect(`${LIST_PATH}?deleted=1`);
}

// Admin override for a single pick. validate_pickem_pick() (the DB trigger
// on pickem_picks) already special-cases is_admin() to skip the kickoff-lock
// check entirely, so this can freely insert/update a pick on an
// already-started game — that's the point of an admin override.
export async function adminSetPickemPick(formData: FormData) {
  const { supabase, user } = await requireAdmin();

  const entryId = formData.get("entryId") as string;
  const gameId = formData.get("gameId") as string;
  const teamId = formData.get("teamId") as string;
  const pickId = ((formData.get("pickId") as string) ?? "").trim() || null;
  const detailPath = `/admin/pickem/entries/${entryId}`;

  if (!entryId || !gameId || !teamId) {
    redirect(`${detailPath}?error=` + encodeURIComponent("Missing pick reference"));
  }

  if (pickId) {
    const { data: before } = await supabase
      .from("pickem_picks")
      .select("game_id, team_id")
      .eq("id", pickId)
      .single();

    if (before && before.team_id === teamId) {
      // Clicking the already-picked team clears the pick rather than
      // re-saving it (a genuine no-op update would just restate the same
      // row) — mirrors the participant-facing "click to deselect" behavior.
      const { error } = await supabase
        .from("pickem_picks")
        .delete()
        .eq("id", pickId)
        .eq("entry_id", entryId);
      if (error) {
        redirect(`${detailPath}?error=` + encodeURIComponent(error.message));
      }

      await logAdminAction(
        supabase,
        user.id,
        "admin_clear_pickem_pick",
        "pickem_picks",
        pickId,
        before,
        {},
        "Pick'em entries — pick cleared by admin"
      );
    } else {
      const { error } = await supabase
        .from("pickem_picks")
        .update({ game_id: gameId, team_id: teamId })
        .eq("id", pickId)
        .eq("entry_id", entryId);
      if (error) {
        redirect(`${detailPath}?error=` + encodeURIComponent(error.message));
      }

      await logAdminAction(
        supabase,
        user.id,
        "admin_update_pickem_pick",
        "pickem_picks",
        pickId,
        before ?? {},
        { game_id: gameId, team_id: teamId },
        "Pick'em entries — pick updated by admin"
      );
    }
  } else {
    // Server-side backstop for the 6-pick cap — the UI already disables
    // buttons on games past the cap, but a stale page load or a direct POST
    // must still be blocked here, since the UI check alone isn't enforcement.
    const { count } = await supabase
      .from("pickem_picks")
      .select("*", { count: "exact", head: true })
      .eq("entry_id", entryId);
    if ((count ?? 0) >= 6) {
      redirect(
        `${detailPath}?error=` +
          encodeURIComponent("This entry already has 6 picks. Remove one before adding another.")
      );
    }

    const { data, error } = await supabase
      .from("pickem_picks")
      .insert({ entry_id: entryId, game_id: gameId, team_id: teamId })
      .select("id")
      .single();
    if (error || !data) {
      redirect(`${detailPath}?error=` + encodeURIComponent(error?.message ?? "Failed to save pick"));
    }

    await logAdminAction(
      supabase,
      user.id,
      "admin_add_pickem_pick",
      "pickem_picks",
      data!.id as string,
      {},
      { entry_id: entryId, game_id: gameId, team_id: teamId },
      "Pick'em entries — pick added by admin"
    );
  }

  revalidatePath(detailPath);
  redirect(`${detailPath}?saved=1`);
}
