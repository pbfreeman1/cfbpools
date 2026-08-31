// Syncs FBS + FCS teams, the regular-season week calendar, the full game
// schedule (FBS and FCS games; DII/DIII/NAIA excluded), and current betting
// lines (into games.home_spread) from collegefootballdata.com into
// master_teams / schedule / games.
// FCS teams are tagged conference: "FCS" (a sentinel the Survivor pool's
// FCS-opponent eligibility check keys on — see step 1b). The narrow "3a."
// backfill below predates the general FCS team sync and is now redundant
// but left in place.
//
// Lines are a best-effort snapshot at sync time — CFBD often has no line
// posted yet for games far from kickoff (home_spread just stays null for
// those), which is why this is meant to be run manually close to the admin's
// weekly Pickem review rather than relied on far in advance. Once a game is
// selected into that week's Pickem pool via /admin/pickem/week, its spread is
// locked into pickem_spread_override separately — this sync only ever writes
// home_spread, so a later re-run can never move a game's line out from under
// an admin who already locked it in.
//
// Invoke with a POST body of { "year": 2026 } (defaults to the current year).
// Add "triggered_by": "<admin user id>" when invoking manually from the admin
// portal so the sync_logs row records who kicked it off; cron invocations
// omit it and are logged with triggered_by = null.
// Add "week": <n> to scope the /games and /lines calls to a single CFBD week
// (used by the "Sync lines from CFBD" button on /admin/pickem/week, so a
// Tuesday-review refresh only touches that week's games instead of the whole
// season) — /teams/fbs and /calendar always stay full-season since neither is
// week-specific. Omit "week" (as /admin/system's full sync does) to sync
// every week's games/lines as before.
// Safe to re-run: everything is upserted on its CFBD id, so running this
// again just refreshes scores/status for games already in the table.

import { createClient } from "npm:@supabase/supabase-js@2";

const CFBD_BASE = "https://api.collegefootballdata.com";

function cfbdHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
}

// sync_logs writes are never allowed to crash the actual sync — each is its
// own try/catch, separate from the sync logic's error handling.
async function startSyncLog(
  supabase: ReturnType<typeof createClient>,
  triggeredBy: string | null
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("sync_logs")
      .insert({ source: "cfbd", status: "running", triggered_by: triggeredBy })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  } catch (err) {
    console.error("[cfbd-sync] Failed to create sync_logs row:", err);
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
    console.error("[cfbd-sync] Failed to update sync_logs row:", err);
  }
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const season = body.year ?? new Date().getFullYear();
  const triggeredBy: string | null = body.triggered_by ?? null;
  // Optional week scope — when set, only that week's /games and /lines are
  // fetched (both cheap, both safe to re-run repeatedly for one week at a
  // time from the Pickem admin page). /teams/fbs and /calendar stay
  // full-season regardless: they aren't week-specific and are cheap either way.
  const week: number | null = body.week ?? null;
  const weekParam = week ? `&week=${week}` : "";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Service role client — this job runs with full DB access and bypasses
  // RLS by design, since it's a trusted server-side sync, not a user action.
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const syncLogId = await startSyncLog(supabase, triggeredBy);

  try {
    const CFBD_API_KEY = Deno.env.get("CFBD_API_KEY");
    if (!CFBD_API_KEY) {
      throw new Error("CFBD_API_KEY secret is not set on this project");
    }

    // 1. Teams — every FBS team, since Pickem can pull from any FBS matchup,
    // not just SEC.
    const teamsRes = await fetch(`${CFBD_BASE}/teams/fbs?year=${season}`, {
      headers: cfbdHeaders(CFBD_API_KEY),
    });
    if (!teamsRes.ok) {
      throw new Error(`CFBD /teams/fbs failed: ${teamsRes.status} ${await teamsRes.text()}`);
    }
    const teams = await teamsRes.json();

    let teamsSynced = 0;
    for (const t of teams) {
      const { error } = await supabase.from("master_teams").upsert(
        {
          cfbd_team_id: t.id,
          school_name: t.school,
          short_name: t.abbreviation ?? t.school,
          mascot: t.mascot,
          conference: t.conference ?? "Independent",
          logo_url: Array.isArray(t.logos) ? t.logos[0] ?? null : null,
          primary_color: t.color ?? null,
          secondary_color: t.alt_color ?? null,
        },
        { onConflict: "cfbd_team_id" }
      );
      if (error) throw new Error(`master_teams upsert failed for ${t.school}: ${error.message}`);
      teamsSynced++;
    }

    // 1b. FCS teams — real FCS matchups (Thursday-night openers, FBS-vs-FCS
    // non-conference games) are valid Pickem games, so their teams need
    // master_teams rows too. Asking CFBD only for classification=fcs keeps
    // DII/DIII/NAIA out, same as the FBS call above.
    //
    // conference is deliberately set to the "FCS" sentinel rather than the
    // team's real FCS conference: the Survivor pool's "opponent is FCS =
    // ineligible pick" rule keys on exactly `conference === "FCS"` in ~6
    // places (pick UI, bonus UI, schedule page, and both server actions —
    // see CLAUDE.md). Storing a real conference name here would silently
    // make SEC-vs-FCS games look like valid Survivor picks. This also makes
    // the narrow step-3a backfill below fully redundant, though it's left
    // in place.
    const fcsTeamsListRes = await fetch(`${CFBD_BASE}/teams?year=${season}&classification=fcs`, {
      headers: cfbdHeaders(CFBD_API_KEY),
    });
    if (!fcsTeamsListRes.ok) {
      throw new Error(
        `CFBD /teams (fcs) failed: ${fcsTeamsListRes.status} ${await fcsTeamsListRes.text()}`
      );
    }
    const fcsTeamsList = await fcsTeamsListRes.json();

    let fcsTeamsPopulated = 0;
    for (const t of fcsTeamsList) {
      const { error } = await supabase.from("master_teams").upsert(
        {
          cfbd_team_id: t.id,
          school_name: t.school,
          short_name: t.abbreviation ?? t.school,
          mascot: t.mascot ?? null,
          conference: "FCS",
          logo_url: Array.isArray(t.logos) ? t.logos[0] ?? null : null,
          primary_color: t.color ?? null,
          secondary_color: t.alt_color ?? null,
        },
        { onConflict: "cfbd_team_id" }
      );
      if (error) {
        throw new Error(`master_teams upsert failed for FCS team ${t.school}: ${error.message}`);
      }
      teamsSynced++;
      fcsTeamsPopulated++;
    }

    // 2. Schedule — regular season weeks only (postseason/bowls are a
    // separate concern from the weekly Survivor/Pickem cadence).
    const calRes = await fetch(`${CFBD_BASE}/calendar?year=${season}`, {
      headers: cfbdHeaders(CFBD_API_KEY),
    });
    if (!calRes.ok) {
      throw new Error(`CFBD /calendar failed: ${calRes.status} ${await calRes.text()}`);
    }
    const calendar = await calRes.json();

    let weeksSynced = 0;
    for (const w of calendar) {
      if (w.seasonType !== "regular") continue;
      const { error } = await supabase.from("schedule").upsert(
        {
          season,
          week_number: w.week,
          label: `Week ${w.week}`,
          start_date: w.startDate?.slice(0, 10),
          end_date: w.endDate?.slice(0, 10),
        },
        { onConflict: "season,week_number" }
      );
      if (error) throw new Error(`schedule upsert failed for week ${w.week}: ${error.message}`);
      weeksSynced++;
    }

    // Build lookup maps so we can translate CFBD's ids into our own foreign keys.
    const { data: scheduleRows, error: schedErr } = await supabase
      .from("schedule")
      .select("id, week_number")
      .eq("season", season);
    if (schedErr) throw new Error(schedErr.message);
    const weekToScheduleId = new Map(scheduleRows.map((r) => [r.week_number, r.id]));

    const { data: teamRows, error: teamErr } = await supabase
      .from("master_teams")
      .select("id, cfbd_team_id, conference");
    if (teamErr) throw new Error(teamErr.message);
    const cfbdIdToTeamId = new Map(teamRows.map((r) => [r.cfbd_team_id, r.id]));
    const secCfbdIds = new Set(
      teamRows.filter((r) => r.conference === "SEC").map((r) => r.cfbd_team_id)
    );

    // 3. Games — regular season, FBS **and** FCS classifications. The
    // classification filter still matters: without it CFBD returns every
    // division (DII, DIII, NAIA...), which is what caused the ~877-game
    // flood on the first run. FBS+FCS is the intended set — real FCS games
    // (e.g. Thursday openers) are selectable Pickem games; anything lower
    // still has no master_teams row and gets skipped in the loop below.
    // Spreads are populated separately by the lines sync below (step 4).
    const [fbsGamesRes, fcsGamesRes] = await Promise.all([
      fetch(`${CFBD_BASE}/games?year=${season}&seasonType=regular&classification=fbs${weekParam}`, {
        headers: cfbdHeaders(CFBD_API_KEY),
      }),
      fetch(`${CFBD_BASE}/games?year=${season}&seasonType=regular&classification=fcs${weekParam}`, {
        headers: cfbdHeaders(CFBD_API_KEY),
      }),
    ]);
    if (!fbsGamesRes.ok) {
      throw new Error(`CFBD /games (fbs) failed: ${fbsGamesRes.status} ${await fbsGamesRes.text()}`);
    }
    if (!fcsGamesRes.ok) {
      throw new Error(`CFBD /games (fcs) failed: ${fcsGamesRes.status} ${await fcsGamesRes.text()}`);
    }
    const fbsGames = await fbsGamesRes.json();
    const fcsGames = await fcsGamesRes.json();

    // An FBS-vs-FCS game appears in both result sets — de-dupe on CFBD game
    // id (the payload is identical from either query).
    // deno-lint-ignore no-explicit-any
    const gamesById = new Map<number, any>();
    for (const g of [...fbsGames, ...fcsGames]) gamesById.set(g.id, g);
    const games = [...gamesById.values()];
    const fbsGamesFetched = fbsGames.length;
    const fcsGamesFetched = fcsGames.length;

    // 3a. An SEC team's FCS opponent has no master_teams row (only FBS teams
    // are synced above), so without a backfill those games would silently
    // hit the "no_home_team"/"no_away_team" skip below — even though the SEC
    // side is very real and belongs on the schedule/pick UI, just correctly
    // marked ineligible like any other non-conference opponent. Lightweight
    // rows only (name + logo, conference: "FCS") — never a valid pick, so
    // every existing `conference !== "SEC"` eligibility check already treats
    // them as non-conference automatically, no separate handling needed.
    const missingSecOpponentIds = new Set<number>();
    for (const g of games) {
      const homeKnown = cfbdIdToTeamId.has(g.homeId);
      const awayKnown = cfbdIdToTeamId.has(g.awayId);
      if (homeKnown && !awayKnown && secCfbdIds.has(g.homeId)) missingSecOpponentIds.add(g.awayId);
      if (awayKnown && !homeKnown && secCfbdIds.has(g.awayId)) missingSecOpponentIds.add(g.homeId);
    }

    let fcsTeamsSynced = 0;
    if (missingSecOpponentIds.size > 0) {
      try {
        const fcsTeamsRes = await fetch(`${CFBD_BASE}/teams?year=${season}&classification=fcs`, {
          headers: cfbdHeaders(CFBD_API_KEY),
        });
        if (!fcsTeamsRes.ok) {
          throw new Error(`CFBD /teams (fcs) failed: ${fcsTeamsRes.status} ${await fcsTeamsRes.text()}`);
        }
        const fcsTeams = await fcsTeamsRes.json();
        const fcsTeamsById = new Map(fcsTeams.map((t: { id: number }) => [t.id, t]));

        for (const cfbdId of missingSecOpponentIds) {
          const t = fcsTeamsById.get(cfbdId) as
            | {
                id: number;
                school: string;
                abbreviation?: string;
                mascot?: string;
                logos?: string[];
                color?: string;
                alt_color?: string;
              }
            | undefined;
          if (!t) continue; // not FCS either (DII/DIII/etc.) — leaves the game skipped, same as before this backfill

          const { data: inserted, error } = await supabase
            .from("master_teams")
            .upsert(
              {
                cfbd_team_id: t.id,
                school_name: t.school,
                short_name: t.abbreviation ?? t.school,
                mascot: t.mascot ?? null,
                conference: "FCS",
                logo_url: Array.isArray(t.logos) ? t.logos[0] ?? null : null,
                primary_color: t.color ?? null,
                secondary_color: t.alt_color ?? null,
              },
              { onConflict: "cfbd_team_id" }
            )
            .select("id")
            .single();
          if (error) {
            throw new Error(`master_teams upsert failed for FCS opponent ${t.school}: ${error.message}`);
          }
          cfbdIdToTeamId.set(t.id, inserted.id);
          fcsTeamsSynced++;
        }
      } catch (err) {
        // Non-fatal — the affected games just stay skipped, exactly like
        // before this backfill existed. Never let this enhancement take
        // down the rest of the sync.
        console.error("[cfbd-sync] FCS opponent backfill failed:", (err as Error).message);
      }
    }

    let gamesSynced = 0;
    let gamesSkipped = 0;
    let skippedNoWeek = 0;
    let skippedNoHomeTeam = 0;
    let skippedNoAwayTeam = 0;
    const sampleSkips: unknown[] = [];

    for (const g of games) {
      const scheduleId = weekToScheduleId.get(g.week);
      const homeTeamId = cfbdIdToTeamId.get(g.homeId);
      const awayTeamId = cfbdIdToTeamId.get(g.awayId);

      // Games against non-FBS opponents (FCS/DII) won't have a master_teams
      // match, since we only synced FBS teams — skip those rather than error.
      // (SEC-vs-FCS games are the exception: 3a. above backfills those
      // specific opponents, so they resolve here instead of hitting this
      // skip. Anything still unresolved is either a non-SEC FCS/DII matchup
      // or a team the FCS backfill couldn't find.)
      if (!scheduleId || !homeTeamId || !awayTeamId) {
        gamesSkipped++;
        if (!scheduleId) skippedNoWeek++;
        if (!homeTeamId) skippedNoHomeTeam++;
        if (!awayTeamId) skippedNoAwayTeam++;
        if (sampleSkips.length < 15) {
          sampleSkips.push({
            id: g.id,
            week: g.week,
            homeId: g.homeId,
            homeTeam: g.homeTeam,
            awayId: g.awayId,
            awayTeam: g.awayTeam,
            reason: !scheduleId ? "no_week" : !homeTeamId ? "no_home_team" : "no_away_team",
          });
        }
        continue;
      }

      const { error } = await supabase.from("games").upsert(
        {
          cfbd_game_id: g.id,
          schedule_id: scheduleId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          kickoff_time: g.startDate,
          venue: g.venue ?? null,
          status: g.completed ? "final" : "scheduled",
          home_score: g.homePoints ?? null,
          away_score: g.awayPoints ?? null,
        },
        { onConflict: "cfbd_game_id" }
      );
      if (error) throw new Error(`games upsert failed for game ${g.id}: ${error.message}`);
      gamesSynced++;
    }

    // 4. Lines — current betting spreads, matched on cfbd_game_id (no team-id
    // translation needed, unlike the games loop above). Non-fatal: the
    // games/teams/schedule sync above is more critical and has already
    // succeeded by this point, so a CFBD /lines outage shouldn't fail the
    // whole run — same pattern as the FCS opponent backfill in step 3a.
    let linesSynced = 0;
    let linesSkippedNoLine = 0;
    let linesSyncError: string | null = null;
    try {
      const linesRes = await fetch(`${CFBD_BASE}/lines?year=${season}&seasonType=regular${weekParam}`, {
        headers: cfbdHeaders(CFBD_API_KEY),
      });
      if (!linesRes.ok) {
        throw new Error(`CFBD /lines failed: ${linesRes.status} ${await linesRes.text()}`);
      }
      const linesGames = await linesRes.json();

      for (const g of linesGames) {
        const providerLines: { provider: string; spread: string | number | null }[] = g.lines ?? [];

        // Prefer the consensus line; fall back to whichever sportsbook is
        // first. A game can have a `lines` array where no provider has a
        // usable spread (empty array, or all-null spreads) — skip it, leave
        // home_spread null, and log which game so a missing Pickem spread is
        // traceable. Non-fatal, same as the gamesSkipped handling above.
        const chosen =
          providerLines.find((l) => l.provider === "consensus" && l.spread != null) ??
          providerLines.find((l) => l.spread != null);
        const spread = chosen ? Number(chosen.spread) : NaN;
        if (!chosen || Number.isNaN(spread)) {
          linesSkippedNoLine++;
          console.log(
            `[cfbd-sync] No usable spread for game ${g.id} (${g.awayTeam ?? "?"} @ ${g.homeTeam ?? "?"}, week ${g.week ?? "?"}) — leaving home_spread null`
          );
          continue;
        }

        // Already in our sign convention (positive = home underdog, negative
        // = home favored) — written straight into home_spread, never into
        // pickem_spread_override, which only the admin's week-setup save can
        // set.
        const { data: updated, error } = await supabase
          .from("games")
          .update({ home_spread: spread })
          .eq("cfbd_game_id", g.id)
          .select("id");
        if (error) throw new Error(`games spread update failed for game ${g.id}: ${error.message}`);
        if (updated && updated.length > 0) linesSynced++;
      }
    } catch (err) {
      linesSyncError = (err as Error).message;
      console.error("[cfbd-sync] Lines sync failed:", linesSyncError);
    }

    await finishSyncLog(supabase, syncLogId, {
      status: "success",
      completed_at: new Date().toISOString(),
      games_updated: gamesSynced,
    });

    return new Response(
      JSON.stringify({
        season,
        week,
        teamsSynced,
        fcsTeamsPopulated,
        fcsTeamsSynced,
        weeksSynced,
        fbsGamesFetched,
        fcsGamesFetched,
        gamesFetchedTotal: games.length,
        gamesSynced,
        gamesSkipped,
        skippedNoWeek,
        skippedNoHomeTeam,
        skippedNoAwayTeam,
        sampleSkips,
        linesSynced,
        linesSkippedNoLine,
        ...(linesSyncError ? { linesSyncError } : {}),
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
