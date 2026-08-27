"use server";

import { createClient } from "@/lib/supabase/server";
import {
  sendEmail,
  adminEmail,
  pickemEntryConfirmationEmail,
  adminNewPickemEntryEmail,
  type PickemEmailPick,
} from "@/lib/email";
import { formatKickoff } from "@/lib/formatDate";

// Escapes ilike wildcard characters so a literal "_" or "%" typed into an
// entry name can't be misread as a pattern by Postgres's ilike.
function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (m) => `\\${m}`);
}

export async function checkPickemEntryNameAvailable(
  scheduleId: string,
  entryName: string
): Promise<boolean> {
  const trimmed = entryName.trim();
  if (!trimmed) return true;

  const supabase = await createClient();
  // Live pre-check only — the DB's unique index on
  // (schedule_id, lower(btrim(entry_name))) is the authoritative backstop,
  // enforced again on insert in createPickemEntry below.
  const { data } = await supabase
    .from("pickem_entries")
    .select("id")
    .eq("schedule_id", scheduleId)
    .ilike("entry_name", escapeIlike(trimmed))
    .limit(1);

  return !(data && data.length > 0);
}

export type CreatePickemEntryResult =
  | { ok: true; entryId: string }
  | { ok: false; error: string; field?: "entryName" };

export async function createPickemEntry(
  scheduleId: string,
  entryName: string
): Promise<CreatePickemEntryResult> {
  const trimmed = entryName.trim();
  if (!trimmed) {
    return { ok: false, error: "Give your entry a name first.", field: "entryName" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You must be logged in to create an entry." };
  }

  const { data, error } = await supabase
    .from("pickem_entries")
    .insert({
      schedule_id: scheduleId,
      user_id: user.id,
      entrant_email: user.email ?? "",
      entry_name: trimmed,
    })
    .select("id")
    .single();

  if (error || !data) {
    // 23505 = unique_violation (pickem_entries_unique_name_per_week).
    if (error?.code === "23505") {
      return {
        ok: false,
        error: "That entry name is already taken for this week — try a different one.",
        field: "entryName",
      };
    }
    // P0001 = raise_exception, e.g. prepare_pickem_entry()'s "entries closed"
    // check — its message is already user-friendly, so surface it directly.
    if (error?.code === "P0001") {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error?.message ?? "Something went wrong creating your entry." };
  }

  return { ok: true, entryId: data.id as string };
}

export type SavePickemPickResult = { ok: true; pickId: string } | { ok: false; error: string };

export async function savePickemPick(
  entryId: string,
  gameId: string,
  teamId: string
): Promise<SavePickemPickResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pickem_picks")
    .insert({ entry_id: entryId, game_id: gameId, team_id: teamId })
    .select("id")
    .single();

  if (error || !data) {
    // validate_pickem_pick() messages (e.g. "You cannot pick a game that has
    // already started") are already user-friendly — surface them as-is.
    return { ok: false, error: error?.message ?? "Something went wrong saving that pick." };
  }
  return { ok: true, pickId: data.id as string };
}

export type UpdatePickemPickResult = { ok: true } | { ok: false; error: string };

// Updates an existing pickem_picks row in place — including reassigning it
// to a different game_id, which is how a pick "moves" from one game to
// another on the edit page (see EditEntryForm.tsx). Regular users have no
// DELETE grant on pickem_picks (only admins do, per RLS), so this
// reassign-in-place approach isn't just a style choice — a delete+reinsert
// swap would fail outright for a normal user.
export async function updatePickemPick(
  entryId: string,
  pickId: string,
  gameId: string,
  teamId: string
): Promise<UpdatePickemPickResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pickem_picks")
    .update({ game_id: gameId, team_id: teamId })
    .eq("id", pickId)
    .eq("entry_id", entryId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type LeaderboardRow = {
  entryId: string;
  entryName: string;
  wins: number;
  losses: number;
  pushes: number;
  effectiveLosses: number;
  pending: number;
  isOwn: boolean;
  rank: number;
};

// Thin wrapper around get_pickem_leaderboard(p_schedule_id) — rank, sort
// order, and the eCount-vs-own-entries windowing are all computed in SQL.
// Rows come back pre-ordered by rank; render them as-is, don't re-sort or
// re-window here.
//
// Returns null on a failed fetch, distinct from an empty array (a real,
// successfully-fetched board with zero entries) — callers that poll for
// updates (LeaderboardTable) rely on this distinction to avoid clobbering
// already-good data with a transient RPC failure.
export async function getPickemLeaderboard(scheduleId: string): Promise<LeaderboardRow[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_pickem_leaderboard", {
    p_schedule_id: scheduleId,
  });

  if (error || !data) return null;

  return (
    data as {
      entry_id: string;
      entry_name: string;
      wins: number;
      losses: number;
      pushes: number;
      effective_losses: number;
      pending: number;
      is_own: boolean;
      rank: number;
    }[]
  ).map((r) => ({
    entryId: r.entry_id,
    entryName: r.entry_name,
    wins: r.wins,
    losses: r.losses,
    pushes: r.pushes,
    effectiveLosses: r.effective_losses,
    pending: r.pending,
    isOwn: r.is_own,
    rank: r.rank,
  }));
}

type PickemPickEmailRow = {
  team_id: string;
  game: {
    home_team_id: string;
    away_team_id: string;
    home_spread: number | null;
    pickem_spread_override: number | null;
    home_team: { school_name: string; short_name: string | null };
    away_team: { school_name: string; short_name: string | null };
  };
};

// Same home-team-perspective spread math as teamSpreadLabel() in
// app/pickem/components/GameCard.tsx, duplicated here rather than imported
// since that file is a "use client" module — a server action can't cross
// that boundary to pull in a client component's helper.
function formatSpreadForEmail(spread: number): string {
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : `${spread}`;
}

function teamSpreadLabelForEmail(
  homeTeamId: string,
  teamId: string,
  effectiveSpread: number | null
): string {
  if (effectiveSpread === null) return "";
  const isHome = teamId === homeTeamId;
  const raw = isHome ? effectiveSpread : effectiveSpread === 0 ? 0 : -effectiveSpread;
  return formatSpreadForEmail(raw);
}

// Sends a confirmation email to the entrant (and, for new entries, an admin
// notification) once an entry's picks are fully saved — called once by the
// form after processPicks()/handleSave() succeeds, not per individual pick
// save, to avoid spamming one email per game. Mirrors createEntry()'s
// email pattern in app/actions/survivor.ts: never allowed to throw or block
// the caller, since this runs after the picks are already durably saved.
export async function sendPickemEntryEmails(
  entryId: string,
  options?: { includeAdmin?: boolean }
): Promise<void> {
  const includeAdmin = options?.includeAdmin ?? true;

  try {
    const supabase = await createClient();

    const { data: entry } = await supabase
      .from("pickem_entries")
      .select("id, entry_name, user_id, schedule_id")
      .eq("id", entryId)
      .maybeSingle();
    if (!entry) return;

    const [{ data: week }, { data: pickRows }, { data: profile }] = await Promise.all([
      supabase.from("schedule").select("week_number").eq("id", entry.schedule_id).single(),
      supabase
        .from("pickem_picks")
        .select(
          `team_id,
           game:games!inner(home_team_id, away_team_id, home_spread, pickem_spread_override,
             home_team:master_teams!games_home_team_id_fkey(school_name, short_name),
             away_team:master_teams!games_away_team_id_fkey(school_name, short_name))`
        )
        .eq("entry_id", entryId),
      supabase
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", entry.user_id)
        .single(),
    ]);

    if (!week || !profile) return;

    const rows = (pickRows ?? []) as unknown as PickemPickEmailRow[];
    const picks: PickemEmailPick[] = rows.map((row) => {
      const isHome = row.team_id === row.game.home_team_id;
      const team = isHome ? row.game.home_team : row.game.away_team;
      const opponent = isHome ? row.game.away_team : row.game.home_team;
      const teamName = team.short_name || team.school_name;
      const opponentName = opponent.short_name || opponent.school_name;
      const effectiveSpread = row.game.pickem_spread_override ?? row.game.home_spread;
      return {
        gameLabel: isHome ? `${opponentName} @ ${teamName}` : `${teamName} @ ${opponentName}`,
        teamName,
        spreadLabel: teamSpreadLabelForEmail(row.game.home_team_id, row.team_id, effectiveSpread),
      };
    });

    const firstName = profile.first_name || "there";
    const email = profile.email;

    if (email) {
      await sendEmail({
        to: email,
        subject: `You're in — Pick'em Week ${week.week_number}`,
        html: pickemEntryConfirmationEmail({
          firstName,
          entryName: entry.entry_name,
          weekNumber: week.week_number,
          picks,
        }),
        stream: "picks",
      });
    }

    if (includeAdmin) {
      const admin = adminEmail();
      if (admin) {
        await sendEmail({
          to: admin,
          subject: `New Pick'em entry — "${entry.entry_name}" (Week ${week.week_number})`,
          html: adminNewPickemEntryEmail({
            firstName,
            lastName: profile.last_name || "",
            email: email || "",
            entryName: entry.entry_name,
            weekNumber: week.week_number,
            picks,
            createdAt: formatKickoff(new Date()),
          }),
          stream: "picks",
        });
      }
    }
  } catch (err) {
    console.error("[sendPickemEntryEmails] Email notification failed:", err);
  }
}
