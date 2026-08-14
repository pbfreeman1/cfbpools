"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sendEmail, bonusPickConfirmationEmail } from "@/lib/email";

export async function saveBonusPick(formData: FormData) {
  const entryId = formData.get("entryId") as string;
  const scheduleId = formData.get("scheduleId") as string;
  const weekNumber = Number(formData.get("weekNumber"));
  const teamAId = formData.get("teamAId") as string;
  const teamBId = formData.get("teamBId") as string;

  const selectorPath = `/survivor/entries/${entryId}/bonus`;
  const weekPath = `${selectorPath}/${weekNumber}`;

  const supabase = await createClient();

  // A team is eligible against ANY FBS opponent — only an FCS opponent makes
  // it ineligible. Same rule the UI greys out with, and the same division of
  // labor as savePick(): the DB trigger checks SEC membership + kickoff, not
  // opponent conference, so this is the real enforcement for FCS eligibility.
  const { data: weekGames, error: weekGamesErr } = await supabase
    .from("games")
    .select(
      `home_team_id, away_team_id,
       home_team:master_teams!games_home_team_id_fkey(id, conference),
       away_team:master_teams!games_away_team_id_fkey(id, conference)`
    )
    .eq("schedule_id", scheduleId);
  if (weekGamesErr) {
    redirect(`${weekPath}?error=${encodeURIComponent(weekGamesErr.message)}`);
  }

  for (const id of [teamAId, teamBId]) {
    const game = (weekGames ?? []).find((g) => g.home_team_id === id || g.away_team_id === id);
    if (!game) {
      redirect(`${weekPath}?error=${encodeURIComponent("That team isn't playing this week")}`);
    }
    const home = game!.home_team as unknown as { conference: string };
    const away = game!.away_team as unknown as { conference: string };
    const opponent = game!.home_team_id === id ? away : home;
    if (opponent.conference === "FCS") {
      redirect(
        `${weekPath}?error=${encodeURIComponent("That team's opponent is FCS this week — ineligible pick")}`
      );
    }
  }

  const { error } = await supabase.from("survivor_bonus_picks").upsert(
    {
      entry_id: entryId,
      schedule_id: scheduleId,
      team_a_id: teamAId,
      team_b_id: teamBId,
    },
    { onConflict: "entry_id,schedule_id" }
  );

  if (error) {
    // Trigger-raised errors (reused team, already locked, cap reached, etc.)
    // land here as Postgres error messages — already written human-readable.
    redirect(`${weekPath}?error=${encodeURIComponent(error.message)}`);
  }

  // Confirmation email — never allowed to block the actual pick save.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email) {
      const [{ data: entry }, { data: teamA }, { data: teamB }] = await Promise.all([
        supabase.from("survivor_entries").select("entry_name, entry_number").eq("id", entryId).single(),
        supabase.from("master_teams").select("school_name").eq("id", teamAId).single(),
        supabase.from("master_teams").select("school_name").eq("id", teamBId).single(),
      ]);

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("id", user.id)
        .single();

      await sendEmail({
        to: user.email,
        subject: `Bonus Pick Confirmed — Week ${weekNumber}: ${teamA?.school_name ?? ""} + ${teamB?.school_name ?? ""}`,
        html: bonusPickConfirmationEmail({
          firstName: profile?.first_name || "there",
          entryName: entry?.entry_name || `Entry ${entry?.entry_number ?? ""}`,
          weekNumber,
          teamAName: teamA?.school_name ?? "your team",
          teamBName: teamB?.school_name ?? "your team",
        }),
        stream: "picks",
      });
    }
  } catch (err) {
    console.error("[saveBonusPick] Confirmation email failed:", err);
  }

  revalidatePath("/survivor");
  revalidatePath(selectorPath);
  redirect(`/survivor?bonus_saved=1&week=${weekNumber}`);
}
