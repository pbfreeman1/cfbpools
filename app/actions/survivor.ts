"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createEntry(formData: FormData) {
  const entryName = (formData.get("entryName") as string) || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existing, error: existingErr } = await supabase
    .from("survivor_entries")
    .select("entry_number")
    .eq("user_id", user.id);
  if (existingErr) {
    redirect(`/survivor/new?error=${encodeURIComponent(existingErr.message)}`);
  }

  if ((existing?.length ?? 0) >= 2) {
    redirect(`/survivor?error=${encodeURIComponent("You already have the maximum of 2 entries")}`);
  }

  const nextEntryNumber = existing?.some((e) => e.entry_number === 1) ? 2 : 1;

  const { error } = await supabase.from("survivor_entries").insert({
    user_id: user.id,
    entry_number: nextEntryNumber,
    entry_name: entryName,
  });

  if (error) {
    redirect(`/survivor/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/survivor");
  redirect("/survivor");
}

export async function savePick(formData: FormData) {
  const entryId = formData.get("entryId") as string;
  const scheduleId = formData.get("scheduleId") as string;
  const teamId = formData.get("teamId") as string;
  const isBonusWeek = formData.get("isBonusWeek") === "on";
  const bonusTeamId = (formData.get("bonusTeamId") as string) || null;

  const supabase = await createClient();

  const { error } = await supabase.from("survivor_picks").upsert(
    {
      entry_id: entryId,
      schedule_id: scheduleId,
      team_id: teamId,
      is_bonus_week: isBonusWeek,
      bonus_team_id: isBonusWeek ? bonusTeamId : null,
    },
    { onConflict: "entry_id,schedule_id" }
  );

  if (error) {
    // Trigger-raised errors (reused team, already locked, etc.) land here
    // as Postgres error messages — surfaced directly, they're already
    // written to be human-readable.
    redirect(`/survivor/${entryId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/survivor/${entryId}`);
  redirect(`/survivor/${entryId}?saved=1`);
}
