// Syncs FBS teams, the regular-season week calendar, and the full game
// schedule from collegefootballdata.com into master_teams / schedule / games.
//
// Does NOT sync betting spreads — those are loaded weekly by the admin closer
// to game day, per the CFBPools workflow (spreads aren't available far in
// advance, and the admin curates which 6 games are eligible for Pickem).
//
// Invoke with a POST body of { "year": 2026 } (defaults to the current year).
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

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const season = body.year ?? new Date().getFullYear();

    const CFBD_API_KEY = Deno.env.get("CFBD_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!CFBD_API_KEY) {
      return new Response(
        JSON.stringify({ error: "CFBD_API_KEY secret is not set on this project" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Service role client — this job runs with full DB access and bypasses
    // RLS by design, since it's a trusted server-side sync, not a user action.
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
      .select("id, cfbd_team_id");
    if (teamErr) throw new Error(teamErr.message);
    const cfbdIdToTeamId = new Map(teamRows.map((r) => [r.cfbd_team_id, r.id]));

    // 3. Games — regular season only. Spreads are intentionally left null here.
    const gamesRes = await fetch(`${CFBD_BASE}/games?year=${season}&seasonType=regular`, {
      headers: cfbdHeaders(CFBD_API_KEY),
    });
    if (!gamesRes.ok) {
      throw new Error(`CFBD /games failed: ${gamesRes.status} ${await gamesRes.text()}`);
    }
    const games = await gamesRes.json();

    let gamesSynced = 0;
    let gamesSkipped = 0;
    for (const g of games) {
      const scheduleId = weekToScheduleId.get(g.week);
      const homeTeamId = cfbdIdToTeamId.get(g.homeId);
      const awayTeamId = cfbdIdToTeamId.get(g.awayId);

      // Games against non-FBS opponents (FCS/DII) won't have a master_teams
      // match, since we only synced FBS teams — skip those rather than error.
      if (!scheduleId || !homeTeamId || !awayTeamId) {
        gamesSkipped++;
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

    return new Response(
      JSON.stringify({ season, teamsSynced, weeksSynced, gamesSynced, gamesSkipped }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
