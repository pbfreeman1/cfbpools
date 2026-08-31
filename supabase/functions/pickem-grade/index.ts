// Grades Pick'em picks once a pickem_selected game goes final. Polls CFBD
// for current status/scores on any pickem_selected game that's kicked off
// and isn't done yet (or is marked final but still has ungraded picks — a
// rare catch-up case, e.g. a previous run's grading step failed partway
// through), updates games.status/home_score/away_score, and grades any
// game that's now final via grade_pickem_game() (see migration
// add_pickem_grading — one batched UPDATE per game, never a per-pick loop).
//
// Decisions made explicitly, not guessed at mid-build:
//
// - is_final / live estimates: while a game is in_progress, this function
//   only updates games.status/home_score/away_score — it never writes a
//   "live estimate" result onto pickem_picks. result stays NULL (shown as
//   "pending" on the leaderboard) until the game is truly final, at which
//   point result and is_final=true are written together, once, in the same
//   batched UPDATE. A live estimate could still flip before the game ends
//   (a backdoor cover, garbage time, a missed 2-point try), which would be
//   a confusing, misleading thing to show as someone's W/L on a public
//   leaderboard mid-game.
//
// - The "no-op cheaply if nothing's status = 'in_progress'" cheap gate:
//   taken completely literally, this would never do anything — nothing else
//   in this codebase ever writes games.status = 'in_progress' (cfbd-sync
//   only ever writes 'scheduled' or 'final'), so a gate that only looks for
//   rows already marked in_progress could never discover a game that just
//   kicked off; it'd be a permanent no-op. This function is the one place
//   that discovers and writes that transition, so the cheap gate instead
//   checks "pickem_selected games whose kickoff has passed and aren't in a
//   terminal status" — the same "is there live work to do" question in
//   spirit, but functionally correct. See `candidates` below. It also
//   separately (and cheaply) checks for already-final games with ungraded
//   picks, so a failed grading pass on a prior run gets retried instead of
//   silently stuck forever.
//
// Auth: verify_jwt is disabled on this function, since the pg_cron job that
// invokes it on a schedule has no user session to attach a JWT to. Instead
// it requires an `x-cron-secret` header matching a value stored in Supabase
// Vault (see the migration) — the cron job reads that same value at call
// time, so there's exactly one copy of the secret to keep in sync, not two.

import { createClient } from "npm:@supabase/supabase-js@2";

const CFBD_BASE = "https://api.collegefootballdata.com";

function cfbdHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
}

async function startSyncLog(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("sync_logs")
      .insert({ source: "pickem_grade", status: "running" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  } catch (err) {
    console.error("[pickem-grade] Failed to create sync_logs row:", err);
    return null;
  }
}

async function finishSyncLog(
  supabase: ReturnType<typeof createClient>,
  syncLogId: string | null,
  update: Record<string, unknown>
) {
  if (!syncLogId) return;
  try {
    const { error } = await supabase.from("sync_logs").update(update).eq("id", syncLogId);
    if (error) throw error;
  } catch (err) {
    console.error("[pickem-grade] Failed to update sync_logs row:", err);
  }
}

type CandidateGame = {
  id: string;
  cfbd_game_id: number | null;
  schedule_id: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
};

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Real auth check — see header comment. get_pickem_grade_cron_secret() is
  // service_role-only (grants revoked from public/anon/authenticated), so
  // this RPC itself can't be used to fish for the secret.
  const { data: expectedSecret, error: secretErr } = await supabase.rpc(
    "get_pickem_grade_cron_secret"
  );
  if (secretErr || !expectedSecret) {
    console.error("[pickem-grade] Could not load cron secret:", secretErr?.message);
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const providedSecret = req.headers.get("x-cron-secret");
  if (providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const syncLogId = await startSyncLog(supabase);

  try {
    const nowIso = new Date().toISOString();

    // Cheap gate — see header comment for why this checks kickoff time
    // rather than status = 'in_progress' literally.
    const { data: candidatesData, error: candErr } = await supabase
      .from("games")
      .select("id, cfbd_game_id, schedule_id, status, home_score, away_score")
      .eq("pickem_selected", true)
      .lte("kickoff_time", nowIso)
      .not("status", "in", "(cancelled,postponed)");
    if (candErr) throw new Error(`Failed to load candidate games: ${candErr.message}`);
    const candidates = (candidatesData ?? []) as CandidateGame[];

    const needsCfbdCheck = candidates.filter((g) => g.status !== "final");
    const alreadyFinal = candidates.filter((g) => g.status === "final");

    let needsRegradeIds: string[] = [];
    if (alreadyFinal.length > 0) {
      const { data: ungraded, error: ungradedErr } = await supabase
        .from("pickem_picks")
        .select("game_id")
        .in(
          "game_id",
          alreadyFinal.map((g) => g.id)
        )
        .is("result", null);
      if (ungradedErr) {
        throw new Error(`Failed to check for ungraded picks: ${ungradedErr.message}`);
      }
      needsRegradeIds = [...new Set((ungraded ?? []).map((p) => p.game_id as string))];
    }

    if (needsCfbdCheck.length === 0 && needsRegradeIds.length === 0) {
      await finishSyncLog(supabase, syncLogId, {
        status: "success",
        completed_at: new Date().toISOString(),
        games_updated: 0,
      });
      return new Response(JSON.stringify({ noop: true, reason: "nothing live or ungraded" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const CFBD_API_KEY = Deno.env.get("CFBD_API_KEY");
    if (!CFBD_API_KEY) {
      throw new Error("CFBD_API_KEY secret is not set on this project");
    }

    // Group by week so a game near a season/week boundary doesn't get
    // missed — same /games endpoint and params cfbd-sync uses.
    const weekIdsNeeded = [...new Set(needsCfbdCheck.map((g) => g.schedule_id))];
    let scheduleRows: { id: string; season: number; week_number: number }[] = [];
    if (weekIdsNeeded.length > 0) {
      const { data, error } = await supabase
        .from("schedule")
        .select("id, season, week_number")
        .in("id", weekIdsNeeded);
      if (error) throw new Error(`Failed to load schedule rows: ${error.message}`);
      scheduleRows = data ?? [];
    }
    const scheduleById = new Map(scheduleRows.map((s) => [s.id, s]));

    const cfbdGameById = new Map<
      number,
      { completed: boolean; homePoints: number | null; awayPoints: number | null }
    >();
    for (const scheduleId of weekIdsNeeded) {
      const week = scheduleById.get(scheduleId);
      if (!week) continue;
      // Both FBS and FCS — a selected game can be an FCS matchup (real FCS
      // openers, etc.). Same widening as cfbd-sync step 3. DII/DIII/NAIA
      // stay excluded by only asking for these two classifications. An
      // FBS-vs-FCS game shows up in both result sets; the Map de-dupes on
      // CFBD game id, and the payload is identical either way.
      for (const classification of ["fbs", "fcs"] as const) {
        const res = await fetch(
          `${CFBD_BASE}/games?year=${week.season}&week=${week.week_number}&seasonType=regular&classification=${classification}`,
          { headers: cfbdHeaders(CFBD_API_KEY) }
        );
        if (!res.ok) {
          console.error(
            `[pickem-grade] CFBD /games (${classification}) failed for week ${week.week_number}: ${res.status} ${await res.text()}`
          );
          continue; // non-fatal — retried next cycle
        }
        const games = await res.json();
        for (const g of games) {
          cfbdGameById.set(g.id, {
            completed: Boolean(g.completed),
            homePoints: g.homePoints ?? null,
            awayPoints: g.awayPoints ?? null,
          });
        }
      }
    }

    let statusUpdates = 0;
    const newlyFinalIds: string[] = [];

    for (const g of needsCfbdCheck) {
      const live = g.cfbd_game_id ? cfbdGameById.get(g.cfbd_game_id) : undefined;
      if (!live) continue; // CFBD hasn't posted this game yet this run — retried next cycle

      const newStatus = live.completed ? "final" : "in_progress";
      const newHomeScore = live.homePoints ?? g.home_score;
      const newAwayScore = live.awayPoints ?? g.away_score;

      if (newStatus === g.status && newHomeScore === g.home_score && newAwayScore === g.away_score) {
        continue; // nothing actually changed — skip the write
      }

      const { error: updErr } = await supabase
        .from("games")
        .update({ status: newStatus, home_score: newHomeScore, away_score: newAwayScore })
        .eq("id", g.id);
      if (updErr) {
        console.error(`[pickem-grade] Failed to update game ${g.id}: ${updErr.message}`);
        continue;
      }
      statusUpdates++;

      if (newStatus === "final" && newHomeScore !== null && newAwayScore !== null) {
        newlyFinalIds.push(g.id);
      }
    }

    const gameIdsToGrade = [...new Set([...newlyFinalIds, ...needsRegradeIds])];

    let picksGraded = 0;
    let gradingErrors = 0;
    for (const gameId of gameIdsToGrade) {
      const { data: updatedCount, error: gradeErr } = await supabase.rpc("grade_pickem_game", {
        p_game_id: gameId,
      });
      if (gradeErr) {
        gradingErrors++;
        console.error(`[pickem-grade] Failed to grade game ${gameId}: ${gradeErr.message}`);
        continue;
      }
      picksGraded += (updatedCount as number) ?? 0;
    }

    await finishSyncLog(supabase, syncLogId, {
      status: gradingErrors > 0 ? "error" : "success",
      completed_at: new Date().toISOString(),
      games_updated: statusUpdates,
      ...(gradingErrors > 0 ? { error_message: `${gradingErrors} game(s) failed to grade` } : {}),
    });

    return new Response(
      JSON.stringify({
        candidates: candidates.length,
        statusUpdates,
        gamesGraded: gameIdsToGrade.length - gradingErrors,
        picksGraded,
        gradingErrors,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    await finishSyncLog(supabase, syncLogId, {
      status: "error",
      completed_at: new Date().toISOString(),
      error_message: (err as Error).message,
    });

    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
