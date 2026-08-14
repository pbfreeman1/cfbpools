// Manual regression check for lib/survivorElimination.ts, exercising the
// exact pipeline the admin results page uses: raw ?preview=1 query params ->
// buildTeamResultMap -> computeEliminations. Written after a real bug
// (bonus-week elimination wouldn't fire unless BOTH legs were resolved, so
// touching only one game's radio button always read back as "undecided")
// shipped past a unit test that only exercised computeEliminations directly
// with a hand-built teamResult map, skipping the params-parsing step where
// the actual repro lived.
//
// Run with: npx tsx scripts/verify-elimination-logic.ts

import { computeEliminations, buildTeamResultMap, type GameResult, type SurvivorPick } from "../lib/survivorElimination";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`);
  } else {
    console.log(`ok: ${label}`);
  }
}

// --- Simulates the exact bug report repro ---
// Entry "BrentTest": bonus week, team=Auburn, bonus_team=Oklahoma.
// Two separate games this week: Auburn vs Georgia, Oklahoma vs Texas.
const AUBURN = "auburn-id";
const GEORGIA = "georgia-id";
const OKLAHOMA = "oklahoma-id";
const TEXAS = "texas-id";
const GAME_AUBURN = "game-auburn-georgia";
const GAME_OKLAHOMA = "game-oklahoma-texas";

const games: GameResult[] = [
  { id: GAME_AUBURN, status: "scheduled", homeScore: null, awayScore: null, homeTeamId: AUBURN, awayTeamId: GEORGIA },
  { id: GAME_OKLAHOMA, status: "scheduled", homeScore: null, awayScore: null, homeTeamId: OKLAHOMA, awayTeamId: TEXAS },
];

const brentTestPick: SurvivorPick = {
  entryId: "entry-1",
  entryName: "BrentTest",
  isBonusWeek: true,
  teamId: AUBURN,
  bonusTeamId: OKLAHOMA,
};

// Repro #1: admin only touches the Oklahoma game, picks Texas as winner
// (i.e. marks Oklahoma the loser). Auburn's game is left untouched.
{
  const params: Record<string, string | undefined> = { preview: "1", [`game_${GAME_OKLAHOMA}`]: TEXAS };
  const overrides = new Map<string, string>();
  for (const g of games) {
    const v = params[`game_${g.id}`];
    if (v) overrides.set(g.id, v);
  }
  const teamResult = buildTeamResultMap(games, overrides);
  const { eliminations, pending } = computeEliminations([brentTestPick], teamResult, 1);
  check("repro #1 (only Oklahoma decided, lost) -> eliminated", eliminations.map((e) => e.entryId), ["entry-1"]);
  check("repro #1 -> nothing pending", pending, []);
}

// Repro #2: admin only touches the Auburn game, picks Georgia as winner
// (i.e. marks Auburn the loser). Oklahoma's game is left untouched.
{
  const params: Record<string, string | undefined> = { preview: "1", [`game_${GAME_AUBURN}`]: GEORGIA };
  const overrides = new Map<string, string>();
  for (const g of games) {
    const v = params[`game_${g.id}`];
    if (v) overrides.set(g.id, v);
  }
  const teamResult = buildTeamResultMap(games, overrides);
  const { eliminations, pending } = computeEliminations([brentTestPick], teamResult, 1);
  check("repro #2 (only Auburn decided, lost) -> eliminated", eliminations.map((e) => e.entryId), ["entry-1"]);
  check("repro #2 -> nothing pending", pending, []);
}

// Sanity: neither game decided -> pending, not eliminated.
{
  const teamResult = buildTeamResultMap(games, new Map());
  const { eliminations, pending } = computeEliminations([brentTestPick], teamResult, 1);
  check("both undecided -> pending", pending.map((p) => p.entryId), ["entry-1"]);
  check("both undecided -> not eliminated", eliminations, []);
}

// Sanity: both games decided, both picks win -> survives (neither list).
{
  const overrides = new Map([
    [GAME_AUBURN, AUBURN],
    [GAME_OKLAHOMA, OKLAHOMA],
  ]);
  const teamResult = buildTeamResultMap(games, overrides);
  const { eliminations, pending } = computeEliminations([brentTestPick], teamResult, 1);
  check("both win -> not eliminated", eliminations, []);
  check("both win -> not pending", pending, []);
}

// Sanity: an already-final (synced) game is read from score, not overrides.
{
  const finalGames: GameResult[] = [
    { id: GAME_AUBURN, status: "final", homeScore: 21, awayScore: 14, homeTeamId: AUBURN, awayTeamId: GEORGIA },
    { id: GAME_OKLAHOMA, status: "scheduled", homeScore: null, awayScore: null, homeTeamId: OKLAHOMA, awayTeamId: TEXAS },
  ];
  // Override for the already-final game must be ignored even if submitted.
  const overrides = new Map([[GAME_AUBURN, GEORGIA]]);
  const teamResult = buildTeamResultMap(finalGames, overrides);
  check("final game score wins over a stray override", teamResult.get(AUBURN), true);
}

// Non-bonus sanity checks.
{
  const nonBonusPicks: SurvivorPick[] = [
    { entryId: "e-win", entryName: "Win", isBonusWeek: false, teamId: AUBURN, bonusTeamId: null },
    { entryId: "e-lose", entryName: "Lose", isBonusWeek: false, teamId: GEORGIA, bonusTeamId: null },
    { entryId: "e-undecided", entryName: "Undecided", isBonusWeek: false, teamId: OKLAHOMA, bonusTeamId: null },
  ];
  const overrides = new Map([[GAME_AUBURN, AUBURN]]);
  const teamResult = buildTeamResultMap(games, overrides);
  const { eliminations, pending } = computeEliminations(nonBonusPicks, teamResult, 1);
  check("non-bonus loser eliminated", eliminations.map((e) => e.entryId), ["e-lose"]);
  check("non-bonus undecided pending", pending.map((p) => p.entryId), ["e-undecided"]);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
