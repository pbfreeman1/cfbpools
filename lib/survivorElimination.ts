// Shared elimination logic for the Survivor pool, used by both the admin
// results page (preview, before anything is written) and the commit server
// action (actually applying it) — so the two can never drift apart.

export type SurvivorPick = {
  entryId: string;
  entryName: string;
  isBonusWeek: boolean;
  teamId: string;
  bonusTeamId: string | null;
};

export type EliminationResult = {
  entryId: string;
  entryName: string;
  reason: string;
};

export type PendingResult = {
  entryId: string;
  entryName: string;
};

/**
 * `teamResult` maps a team id to whether it won its game this week — only
 * for teams whose game has a determined winner. A team absent from the map
 * means that game hasn't been decided yet, so any entry riding on it is left
 * untouched (not eliminated, not confirmed) rather than guessed at.
 */
export function computeEliminations(
  picks: SurvivorPick[],
  teamResult: Map<string, boolean>,
  weekNumber: number
): { eliminations: EliminationResult[]; pending: PendingResult[] } {
  const eliminations: EliminationResult[] = [];
  const pending: PendingResult[] = [];

  for (const pick of picks) {
    const teamWon = teamResult.get(pick.teamId);

    if (!pick.isBonusWeek) {
      if (teamWon === undefined) {
        pending.push({ entryId: pick.entryId, entryName: pick.entryName });
        continue;
      }
      if (!teamWon) {
        eliminations.push({
          entryId: pick.entryId,
          entryName: pick.entryName,
          reason: `Picked a losing team in Week ${weekNumber}`,
        });
      }
      continue;
    }

    // Bonus week — both the pick and the bonus pick must win. A single
    // confirmed loss is enough to eliminate immediately; we don't need to
    // wait on the other game's result too.
    const bonusWon = pick.bonusTeamId ? teamResult.get(pick.bonusTeamId) : undefined;
    if (teamWon === false || bonusWon === false) {
      eliminations.push({
        entryId: pick.entryId,
        entryName: pick.entryName,
        reason: `Bonus week in Week ${weekNumber} — both picks must win`,
      });
      continue;
    }
    if (teamWon === undefined || bonusWon === undefined) {
      pending.push({ entryId: pick.entryId, entryName: pick.entryName });
    }
    // Both defined and both true: entry survives, no action needed.
  }

  return { eliminations, pending };
}

export type GameResult = {
  id: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: string;
  awayTeamId: string;
};

/**
 * Builds the teamId -> won map computeEliminations expects, from
 * already-final games plus manual winner overrides for games that aren't
 * final yet (e.g. an admin's form selections before anything is committed).
 * Pulled out as its own function — rather than left inline in the results
 * page — so the params-to-map wiring itself is unit-testable, not just the
 * elimination math downstream of it.
 */
export function buildTeamResultMap(
  games: GameResult[],
  overrideWinnerByGameId: Map<string, string>
): Map<string, boolean> {
  const teamResult = new Map<string, boolean>();

  for (const g of games) {
    if (g.status === "final" && g.homeScore !== null && g.awayScore !== null && g.homeScore !== g.awayScore) {
      const homeWon = g.homeScore > g.awayScore;
      teamResult.set(g.homeTeamId, homeWon);
      teamResult.set(g.awayTeamId, !homeWon);
      continue;
    }

    const winnerId = overrideWinnerByGameId.get(g.id);
    if (winnerId === g.homeTeamId) {
      teamResult.set(g.homeTeamId, true);
      teamResult.set(g.awayTeamId, false);
    } else if (winnerId === g.awayTeamId) {
      teamResult.set(g.awayTeamId, true);
      teamResult.set(g.homeTeamId, false);
    }
  }

  return teamResult;
}
