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

    // Bonus week — both the pick and the bonus pick must win.
    const bonusWon = pick.bonusTeamId ? teamResult.get(pick.bonusTeamId) : undefined;
    if (teamWon === undefined || bonusWon === undefined) {
      pending.push({ entryId: pick.entryId, entryName: pick.entryName });
      continue;
    }
    if (!teamWon || !bonusWon) {
      eliminations.push({
        entryId: pick.entryId,
        entryName: pick.entryName,
        reason: `Bonus week in Week ${weekNumber} — both picks must win`,
      });
    }
  }

  return { eliminations, pending };
}
