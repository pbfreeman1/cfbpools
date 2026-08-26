"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { checkPickemEntryNameAvailable, createPickemEntry, savePickemPick, sendPickemEntryEmails } from "@/app/actions/pickem";
import { GameCard, teamSpreadLabel, type GameOption } from "@/app/pickem/components/GameCard";
import { PicksTray, type PickChip } from "@/app/pickem/components/PicksTray";

export type { GameTeam, GameOption } from "@/app/pickem/components/GameCard";

type NameCheckStatus = "idle" | "checking" | "available" | "taken";
type FailedGame = { gameId: string; message: string };

// Fixed rule of the pool itself ("Pick 6 winners against the spread"),
// independent of how many games the admin curates into a given week's pool
// (that count is genuinely variable — see GameOption[] / games.length).
const PICKS_REQUIRED = 6;

export default function NewEntryForm({
  scheduleId,
  games,
}: {
  scheduleId: string;
  games: GameOption[];
}) {
  const [entryName, setEntryName] = useState("");
  const [nameCheck, setNameCheck] = useState<NameCheckStatus>("idle");
  const [entryNameError, setEntryNameError] = useState<string | null>(null);
  const [stage, setStage] = useState<"name" | "picks">("name");
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [entryId, setEntryId] = useState<string | null>(null);
  const [savedGameIds, setSavedGameIds] = useState<Set<string>>(new Set());
  const [skippedGameIds, setSkippedGameIds] = useState<Set<string>>(new Set());
  const [failedGame, setFailedGame] = useState<FailedGame | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [allSaved, setAllSaved] = useState(false);

  // Snapshot "now" once at mount rather than re-checking every render — the
  // DB trigger (validate_pickem_pick) is the real enforcement either way, so
  // this only needs to be close enough to disable the obvious cases.
  const [now] = useState(() => Date.now());

  const unlockedGames = useMemo(
    () => games.filter((g) => new Date(g.kickoffTime).getTime() > now),
    [games, now]
  );
  // Defensive floor for the rare case entries are somehow still open with
  // fewer than 6 unlocked games left (the entry-close trigger is designed to
  // prevent this) — without it, hitting exactly 6 would be unreachable and
  // the submit button would hang disabled forever. Doesn't change what's
  // displayed ("of 6"), only what the gate actually requires.
  const pickTarget = Math.min(PICKS_REQUIRED, unlockedGames.length);

  const pickedGameIds = useMemo(
    () => new Set(Object.entries(picks).filter(([, teamId]) => teamId).map(([gameId]) => gameId)),
    [picks]
  );
  const pickedCount = pickedGameIds.size;
  const allPicked = pickTarget > 0 && pickedCount === pickTarget;

  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const trayChips: PickChip[] = useMemo(
    () =>
      Object.entries(picks)
        .filter(([, teamId]) => teamId)
        .map(([gameId, teamId]) => {
          const game = gamesById.get(gameId);
          if (!game) return null;
          const team = game.homeTeam.id === teamId ? game.homeTeam : game.awayTeam;
          return {
            gameId,
            logoUrl: team.logoUrl,
            teamName: team.name,
            spreadLabel: teamSpreadLabel(game, teamId),
          };
        })
        .filter((c): c is PickChip => c !== null),
    [picks, gamesById]
  );

  // Debounced live uniqueness check — the unique index on
  // (schedule_id, lower(btrim(entry_name))) is the real backstop, checked
  // again server-side on submit.
  useEffect(() => {
    const trimmed = entryName.trim();
    setEntryNameError(null);
    if (entryId) return; // name is locked in once the entry row exists
    if (!trimmed) {
      setNameCheck("idle");
      return;
    }
    setNameCheck("checking");
    let cancelled = false;
    const timer = setTimeout(async () => {
      const available = await checkPickemEntryNameAvailable(scheduleId, trimmed);
      if (!cancelled) setNameCheck(available ? "available" : "taken");
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [entryName, scheduleId, entryId]);

  function selectTeam(gameId: string, teamId: string) {
    setPicks((prev) => {
      const alreadyPickedThisGame = Boolean(prev[gameId]);
      const currentCount = Object.values(prev).filter(Boolean).length;
      // At the 6-pick cap, block picking a *new* game — but switching teams
      // within, or deselecting, a game that's already one of the 6 is always
      // allowed (deselecting frees the slot for a different game).
      if (!alreadyPickedThisGame && currentCount >= pickTarget) {
        return prev;
      }
      return {
        ...prev,
        [gameId]: prev[gameId] === teamId ? "" : teamId,
      };
    });
  }

  // Inserts picks one at a time (not a single batch insert) so a failure —
  // e.g. a game kicking off mid-submit — can be attributed to exactly one
  // game, with everything before it already durably saved.
  async function processPicks(entryIdToUse: string, alreadySaved: Set<string>): Promise<boolean> {
    const remaining = games.filter((g) => picks[g.id] && !alreadySaved.has(g.id));
    for (const game of remaining) {
      const teamId = picks[game.id];
      const result = await savePickemPick(entryIdToUse, game.id, teamId);
      if (!result.ok) {
        setFailedGame({ gameId: game.id, message: result.error });
        return false;
      }
      alreadySaved.add(game.id);
      setSavedGameIds(new Set(alreadySaved));
    }
    return true;
  }

  async function handleSubmit() {
    setSubmitError(null);
    setFailedGame(null);
    setSubmitting(true);

    let currentEntryId = entryId;
    if (!currentEntryId) {
      const result = await createPickemEntry(scheduleId, entryName);
      if (!result.ok) {
        if (result.field === "entryName") setEntryNameError(result.error);
        else setSubmitError(result.error);
        setSubmitting(false);
        return;
      }
      currentEntryId = result.entryId;
      setEntryId(currentEntryId);
    }

    const success = await processPicks(currentEntryId, new Set(savedGameIds));
    setSubmitting(false);
    if (success) {
      setAllSaved(true);
      // Fire-and-forget — never blocks the confirmation screen on email
      // delivery, matching sendEmail()'s own "never throws" contract.
      sendPickemEntryEmails(currentEntryId).catch(() => {});
    }
  }

  function skipFailedGame() {
    if (!failedGame) return;
    const gameId = failedGame.gameId;
    setSkippedGameIds((prev) => new Set(prev).add(gameId));
    // Clear the pick so this game's slot actually frees up for a different one.
    setPicks((prev) => {
      const next = { ...prev };
      delete next[gameId];
      return next;
    });
    setFailedGame(null);
  }

  if (allSaved) {
    return (
      <div className="rounded-lg border border-alive/40 bg-alive/5 p-6">
        <p className="text-center font-display text-lg font-bold uppercase tracking-wide text-alive">
          You&apos;re in!
        </p>
        <p className="mt-2 text-center text-sm text-muted">
          &quot;{entryName.trim()}&quot; is entered for this week with {savedGameIds.size} pick
          {savedGameIds.size === 1 ? "" : "s"} saved
          {skippedGameIds.size > 0
            ? ` (${skippedGameIds.size} game${skippedGameIds.size === 1 ? "" : "s"} skipped — already started)`
            : ""}
          .
        </p>

        <div className="mt-5 flex flex-col gap-2 rounded-md border border-edge bg-app px-4 py-3 text-sm text-ink">
          <p>
            <span className="font-semibold">$10 entry fee</span> via Venmo to{" "}
            <span className="font-semibold">@brentfreeman1</span>.
          </p>
          <p className="text-muted">Enter as many times as you&apos;d like — entries are unlimited.</p>
          <p className="text-muted">
            The leaderboard and live scores will update on the Pick&apos;em page as games kick off.
          </p>
        </div>

        <Link
          href="/pickem"
          className="mt-4 block rounded-md bg-pickem-500 px-4 py-2 text-center text-sm font-semibold text-app transition hover:bg-pickem-600"
        >
          Back to Pick&apos;em
        </Link>
      </div>
    );
  }

  if (stage === "name") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="entryName" className="mb-1 block text-sm font-medium text-ink">
            Entry name
          </label>
          <input
            id="entryName"
            type="text"
            value={entryName}
            onChange={(e) => setEntryName(e.target.value)}
            placeholder="e.g. The Comeback Kids"
            className="w-full rounded-md border border-edge bg-app px-3 py-2 text-base text-ink placeholder:text-muted focus:border-pickem-500 focus:outline-none focus:ring-1 focus:ring-pickem-500"
          />
          {entryName.trim() && (
            <p
              className={`mt-1 text-xs ${
                nameCheck === "taken" ? "text-dead" : nameCheck === "available" ? "text-alive" : "text-muted"
              }`}
            >
              {nameCheck === "checking" && "Checking availability…"}
              {nameCheck === "available" && "Available"}
              {nameCheck === "taken" && "That name is already taken for this week."}
            </p>
          )}
          {entryNameError && <p className="mt-1 text-xs text-dead">{entryNameError}</p>}
        </div>

        <button
          type="button"
          onClick={() => setStage("picks")}
          disabled={!entryName.trim() || nameCheck === "taken"}
          className="rounded-md bg-pickem-500 px-5 py-2.5 text-sm font-semibold text-app transition hover:bg-pickem-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-32">
      <div className="flex items-center justify-between rounded-md border border-edge bg-surface px-3 py-2.5">
        <span className="truncate text-sm font-medium text-ink">{entryName.trim()}</span>
        {!entryId && (
          <button
            type="button"
            onClick={() => setStage("name")}
            className="flex-shrink-0 text-xs font-medium text-pickem-400 hover:underline"
          >
            Edit name
          </button>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">This week&apos;s games</h2>
          <span className="font-data text-sm font-semibold text-pickem-400">
            {pickedCount} of {PICKS_REQUIRED} picked
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">Choose any 6 of the games below.</p>
      </div>

      {games.length === 0 ? (
        <p className="text-sm text-muted">No games have been added to the Pick&apos;em pool yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {games.map((game) => {
            const isLocked = new Date(game.kickoffTime).getTime() <= now;
            const isSkipped = skippedGameIds.has(game.id);
            const isSaved = savedGameIds.has(game.id);
            const isFailed = failedGame?.gameId === game.id;
            // Once 6 games have a pick, every *other* game's buttons disable —
            // but a game that's already one of the 6 stays interactive so its
            // own pick can still be switched or cleared.
            const capBlocksThisGame = pickedCount >= pickTarget && !pickedGameIds.has(game.id);
            const teamsDisabled = isLocked || isSaved || isSkipped || capBlocksThisGame;

            return (
              <GameCard
                key={game.id}
                game={game}
                now={now}
                selectedTeamId={picks[game.id] || undefined}
                disabled={teamsDisabled}
                onSelectTeam={(teamId) => selectTeam(game.id, teamId)}
                variant={isFailed ? "failed" : isSaved ? "saved" : isSkipped ? "skipped" : "default"}
                badges={[
                  ...(isSaved ? [{ label: "Saved", tone: "success" as const }] : []),
                  ...(isSkipped ? [{ label: "Skipped", tone: "neutral" as const }] : []),
                ]}
                error={
                  isFailed
                    ? {
                        message: failedGame!.message,
                        actions: [
                          { label: "Retry", onClick: handleSubmit },
                          { label: "Skip this game", onClick: skipFailedGame },
                        ],
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      )}

      {submitError && <p className="rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{submitError}</p>}

      <PicksTray
        label={`"${entryName.trim()}" — ${pickedCount}/${PICKS_REQUIRED} picked`}
        chips={trayChips}
        actionLabel={submitting ? "Saving…" : entryId ? "Save Remaining Picks" : "Create Entry & Save Picks"}
        onAction={handleSubmit}
        actionDisabled={submitting || nameCheck === "taken" || !allPicked || Boolean(failedGame)}
      />
    </div>
  );
}
