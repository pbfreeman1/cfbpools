"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ENTRY_DEADLINE } from "@/lib/season";
import {
  sendEmail,
  adminEmail,
  welcomeToSurvivorPoolEmail,
  adminNewEntryEmail,
  pickConfirmationEmail,
} from "@/lib/email";

export async function createEntry(formData: FormData) {
  const entryNameInput = (formData.get("entryName") as string) || null;

  if (new Date() > ENTRY_DEADLINE) {
    redirect(`/survivor?error=${encodeURIComponent("The entry deadline has passed")}`);
  }

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
    entry_name: entryNameInput,
  });

  if (error) {
    redirect(`/survivor/new?error=${encodeURIComponent(error.message)}`);
  }

  // Email notifications — never allowed to block the actual entry creation.
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();

    const finalEntryName = entryNameInput || `Entry ${nextEntryNumber}`;
    const firstName = profile?.first_name || "there";
    const createdAt = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

    if (user.email) {
      await sendEmail({
        to: user.email,
        subject: "You're in — SEC Survivor Pool",
        html: welcomeToSurvivorPoolEmail({
          firstName,
          entryName: finalEntryName,
          deadlineText: ENTRY_DEADLINE.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          }),
        }),
        stream: "welcome",
      });
    }

    const admin = adminEmail();
    if (admin) {
      const { count } = await supabase
        .from("survivor_entries")
        .select("*", { count: "exact", head: true });

      await sendEmail({
        to: admin,
        subject: `New Survivor entry — "${finalEntryName}" (entry #${count ?? "?"})`,
        html: adminNewEntryEmail({
          firstName,
          lastName: profile?.last_name || "",
          email: user.email || "",
          entryName: finalEntryName,
          entryNumber: nextEntryNumber,
          createdAt,
        }),
        stream: "picks",
      });
    }
  } catch (err) {
    console.error("[createEntry] Email notification failed:", err);
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

  // A team is eligible against ANY FBS opponent (any conference) — only an
  // FCS opponent makes it ineligible. Same rule the pick UI greys out with.
  // Checked server-side since the UI only disables the button; nothing
  // stops a direct form submission.
  const teamIdsToValidate = isBonusWeek && bonusTeamId ? [teamId, bonusTeamId] : [teamId];
  const { data: weekGames, error: weekGamesErr } = await supabase
    .from("games")
    .select(
      `home_team_id, away_team_id,
       home_team:master_teams!games_home_team_id_fkey(id, conference),
       away_team:master_teams!games_away_team_id_fkey(id, conference)`
    )
    .eq("schedule_id", scheduleId);
  if (weekGamesErr) {
    redirect(`/survivor/${entryId}?error=${encodeURIComponent(weekGamesErr.message)}`);
  }

  for (const id of teamIdsToValidate) {
    const game = (weekGames ?? []).find((g) => g.home_team_id === id || g.away_team_id === id);
    if (!game) {
      redirect(`/survivor/${entryId}?error=${encodeURIComponent("That team isn't playing this week")}`);
    }
    const home = game!.home_team as unknown as { conference: string };
    const away = game!.away_team as unknown as { conference: string };
    const opponent = game!.home_team_id === id ? away : home;
    if (opponent.conference === "FCS") {
      redirect(
        `/survivor/${entryId}?error=${encodeURIComponent("That team's opponent is FCS this week — ineligible pick")}`
      );
    }
  }

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

  // Confirmation email — never allowed to block the actual pick save.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email) {
      const [{ data: entry }, { data: week }, { data: team }, { data: bonusTeam }] =
        await Promise.all([
          supabase
            .from("survivor_entries")
            .select("entry_name, entry_number")
            .eq("id", entryId)
            .single(),
          supabase.from("schedule").select("week_number").eq("id", scheduleId).single(),
          supabase.from("master_teams").select("school_name").eq("id", teamId).single(),
          isBonusWeek && bonusTeamId
            ? supabase.from("master_teams").select("school_name").eq("id", bonusTeamId).single()
            : Promise.resolve({ data: null }),
        ]);

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("id", user.id)
        .single();

      await sendEmail({
        to: user.email,
        subject: `Pick confirmed — Week ${week?.week_number ?? "?"}`,
        html: pickConfirmationEmail({
          firstName: profile?.first_name || "there",
          entryName: entry?.entry_name || `Entry ${entry?.entry_number ?? ""}`,
          weekNumber: week?.week_number ?? 0,
          teamName: team?.school_name ?? "your team",
          isBonus: isBonusWeek,
          bonusTeamName: bonusTeam?.school_name ?? null,
        }),
        stream: "picks",
      });
    }
  } catch (err) {
    console.error("[savePick] Confirmation email failed:", err);
  }

  revalidatePath(`/survivor/${entryId}`);
  redirect(`/survivor/${entryId}?saved=1`);
}
