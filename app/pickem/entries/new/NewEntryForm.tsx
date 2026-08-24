"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { checkPickemEntryNameAvailable, createPickemEntry, savePickemPick } from "@/app/actions/pickem";
import { formatScheduleRow } from "@/lib/formatDate";
import { isReadableOnDark } from "@/lib/color";

export type GameTeam = {
  id: string;
  name: string;
  logoUrl: string | null;
  color: string | null;
};

export type GameOption = {
  id: string;
  kickoffTime: string;
  venue: string | null;
  effectiveSpread: number | null;
  homeTeam: GameTeam;
  awayTeam: GameTeam;
};

type NameCheckStatus = "idle" | "checking" | "available" | "taken";
type FailedGame = { gameId: string; message: string };

function favoriteSummary(game: GameOption): string | null {
  const spread = game.effectiveSpread;
  if (spread === null) return null;
  if (spread === 0) return "Pick'em (even)";
  const favored = spread < 0 ? game.homeTeam : game.awayTeam;
  return `${favored.name} -${Math.abs(spread)}`;
}

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
  const requiredGames = useMemo(
    () => unlockedGames.filter((g) => !skippedGameIds.has(g.id)),
    [unlockedGames, skippedGameIds]
  );
  const pickedCount = requiredGames.filter((g) => picks[g.id]).length;
  const allPicked = requiredGames.length > 0 && pickedCount === requiredGames.length;

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
    setPicks((prev) => ({
      ...prev,
      [gameId]: prev[gameId] === teamId ? "" : teamId,
    }));
  }

  // Inserts picks one at a time (not a single batch insert) so a failure —
  // e.g. a game kicking off mid-submit — can be attributed to exactly one
  // game, with everything before it already durably saved.
  async function processPicks(entryIdToUse: string, alreadySaved: Set<string>): Promise<boolean> {
    const remaining = requiredGames.filter((g) => !alreadySaved.has(g.id));
    for (const game of remaining) {
      const teamId = picks[game.id];
      if (!teamId) continue;
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
    if (success) setAllSaved(true);
  }

  function skipFailedGame() {
    if (!failedGame) return;
    setSkippedGameIds((prev) => new Set(prev).add(failedGame.gameId));
    setFailedGame(null);
  }

  if (allSaved) {
    return (
      <div className="rounded-lg border border-alive/40 bg-alive/5 p-6 text-center">
        <p className="font-display text-lg font-bold uppercase tracking-wide text-alive">
          You&apos;re in!
        </p>
        <p className="mt-2 text-sm text-muted">
          &quot;{entryName.trim()}&quot; is entered for this week with {savedGameIds.size} pick
          {savedGameIds.size === 1 ? "" : "s"} saved
          {skippedGameIds.size > 0
            ? ` (${skippedGameIds.size} game${skippedGameIds.size === 1 ? "" : "s"} skipped — already started)`
            : ""}
          .
        </p>
        <Link
          href="/pickem"
          className="mt-4 inline-block rounded-md bg-pickem-500 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-pickem-600"
        >
          Back to Pick&apos;em
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div>
        <label htmlFor="entryName" className="mb-1 block text-sm font-medium text-ink">
          Entry name
        </label>
        <input
          id="entryName"
          type="text"
          value={entryName}
          onChange={(e) => setEntryName(e.target.value)}
          disabled={Boolean(entryId)}
          placeholder="e.g. The Comeback Kids"
          className="w-full rounded-md border border-edge bg-app px-3 py-2 text-base text-ink placeholder:text-muted focus:border-pickem-500 focus:outline-none focus:ring-1 focus:ring-pickem-500 disabled:opacity-60"
        />
        {!entryId && entryName.trim() && (
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

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">This week&apos;s games</h2>
        <span className="font-data text-sm font-semibold text-pickem-400">
          {pickedCount} of {games.length} picked
        </span>
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
            const teamsDisabled = isLocked || isSaved || isSkipped;
            const summary = favoriteSummary(game);
            const selectedTeamId = picks[game.id];

            return (
              <div
                key={game.id}
                className={`rounded-lg border p-3 ${
                  isFailed
                    ? "border-dead"
                    : isSaved
                      ? "border-alive/40 bg-alive/5"
                      : isSkipped
                        ? "border-edge bg-surface-hover opacity-60"
                        : "border-edge bg-surface"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted">
                  <span>
                    {formatScheduleRow(game.kickoffTime)}
                    {game.venue ? ` · ${game.venue}` : ""}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {summary && <span className="font-data text-ink">{summary}</span>}
                    {isLocked && !isSaved && (
                      <span className="rounded bg-edge px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                        Locked
                      </span>
                    )}
                    {isSaved && (
                      <span className="rounded bg-alive/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-alive">
                        Saved
                      </span>
                    )}
                    {isSkipped && (
                      <span className="rounded bg-edge px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                        Skipped
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[game.awayTeam, game.homeTeam].map((team) => {
                    const selected = selectedTeamId === team.id;
                    return (
                      <button
                        key={team.id}
                        type="button"
                        disabled={teamsDisabled}
                        onClick={() => selectTeam(game.id, team.id)}
                        style={
                          !teamsDisabled && team.color && isReadableOnDark(team.color)
                            ? { borderLeftColor: team.color, borderLeftWidth: "3px" }
                            : undefined
                        }
                        className={
                          "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition " +
                          (teamsDisabled
                            ? "cursor-not-allowed border-edge opacity-60"
                            : selected
                              ? "border-pickem-500 bg-pickem-500/10 font-semibold text-pickem-400"
                              : "border-edge text-ink hover:bg-surface-hover")
                        }
                      >
                        {team.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={team.logoUrl} alt="" className="h-5 w-5 flex-shrink-0 object-contain" />
                        )}
                        <span className="truncate">{team.name}</span>
                      </button>
                    );
                  })}
                </div>

                {isFailed && (
                  <div className="mt-2 rounded-md bg-dead/10 px-3 py-2 text-xs text-dead">
                    <p className="mb-1.5">{failedGame?.message}</p>
                    <div className="flex gap-3">
                      <button type="button" onClick={handleSubmit} className="font-semibold underline">
                        Retry
                      </button>
                      <button type="button" onClick={skipFailedGame} className="font-semibold underline">
                        Skip this game
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {submitError && <p className="rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{submitError}</p>}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-surface px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
        <div className="mx-auto flex max-w-sm items-center justify-between gap-3 sm:max-w-xl md:max-w-3xl">
          <span className="truncate text-xs text-muted">
            {entryName.trim() ? `"${entryName.trim()}"` : "Name your entry"} — {pickedCount}/
            {games.length} picked
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !entryName.trim() || nameCheck === "taken" || !allPicked || Boolean(failedGame)}
            className="flex-shrink-0 rounded-md bg-pickem-500 px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-pickem-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving…" : entryId ? "Save Remaining Picks" : "Create Entry & Save Picks"}
          </button>
        </div>
      </div>
    </div>
  );
}
