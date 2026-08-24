"use client";

import { useMemo, useState } from "react";
import { savePickemPick, updatePickemPick } from "@/app/actions/pickem";
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

export type ExistingPick = { id: string; gameId: string; teamId: string };

// Fixed rule of the pool itself ("Pick 6 winners against the spread"),
// independent of how many games the admin curated into this week's pool.
const PICKS_REQUIRED = 6;

type PickRow = {
  // null until a fresh insert for this slot has succeeded.
  rowId: string | null;
  // Current desired game/team for this slot — null means the slot is
  // currently empty (its pick was deselected and it's free for reuse).
  gameId: string | null;
  teamId: string | null;
  // What's durably persisted in the DB for this row right now.
  savedGameId: string | null;
  savedTeamId: string | null;
};

type FailedGame = { gameId: string; message: string };

function favoriteSummary(game: GameOption): string | null {
  const spread = game.effectiveSpread;
  if (spread === null) return null;
  if (spread === 0) return "Pick'em (even)";
  const favored = spread < 0 ? game.homeTeam : game.awayTeam;
  return `${favored.name} -${Math.abs(spread)}`;
}

export default function EditEntryForm({
  entryId,
  games,
  existingPicks,
}: {
  entryId: string;
  games: GameOption[];
  existingPicks: ExistingPick[];
}) {
  const [rows, setRows] = useState<PickRow[]>(() =>
    existingPicks.map((p) => ({
      rowId: p.id,
      gameId: p.gameId,
      teamId: p.teamId,
      savedGameId: p.gameId,
      savedTeamId: p.teamId,
    }))
  );
  const [failedGame, setFailedGame] = useState<FailedGame | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  // Snapshot "now" once at mount — the DB trigger (validate_pickem_pick) is
  // the real enforcement either way, this just needs to be close enough to
  // disable the obvious cases.
  const [now] = useState(() => Date.now());

  const originalGameIds = useMemo(() => new Set(existingPicks.map((p) => p.gameId)), [existingPicks]);

  // A game counts toward the achievable total if it's still open, or if it
  // was already one of this entry's locked-in picks (already achieved, even
  // though it's no longer open) — defensive floor for the rare case the
  // pool doesn't have enough open games left to reach 6.
  const pickTarget = useMemo(() => {
    const achievable = games.filter(
      (g) => new Date(g.kickoffTime).getTime() > now || originalGameIds.has(g.id)
    ).length;
    return Math.min(PICKS_REQUIRED, achievable);
  }, [games, now, originalGameIds]);

  const picksByGame = useMemo(() => {
    const m: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.gameId) m[r.gameId] = r.teamId!;
    });
    return m;
  }, [rows]);

  const pickedCount = rows.filter((r) => r.gameId !== null).length;
  const allPicked = pickTarget > 0 && pickedCount === pickTarget;

  function selectTeam(gameId: string, teamId: string) {
    if (saving) return;
    setSavedBanner(false);
    setRows((prev) => {
      const existingIdx = prev.findIndex((r) => r.gameId === gameId);
      if (existingIdx >= 0) {
        const row = prev[existingIdx];
        const next = [...prev];
        next[existingIdx] =
          row.teamId === teamId
            ? { ...row, gameId: null, teamId: null } // deselect — free this slot, keep rowId for reuse
            : { ...row, teamId }; // switch team within the same game
        return next;
      }

      // Game not currently assigned to any slot.
      const currentCount = prev.filter((r) => r.gameId !== null).length;
      if (currentCount >= pickTarget) return prev; // at cap — no-op

      const emptyIdx = prev.findIndex((r) => r.gameId === null);
      if (emptyIdx >= 0) {
        const next = [...prev];
        next[emptyIdx] = { ...next[emptyIdx], gameId, teamId };
        return next;
      }

      return [...prev, { rowId: null, gameId, teamId, savedGameId: null, savedTeamId: null }];
    });
  }

  function revertFailedGame() {
    if (!failedGame) return;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.gameId === failedGame.gameId);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], gameId: next[idx].savedGameId, teamId: next[idx].savedTeamId };
      return next;
    });
    setFailedGame(null);
  }

  async function handleSave() {
    setSaveError(null);
    setFailedGame(null);
    setSavedBanner(false);
    setSaving(true);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.gameId === null) continue; // empty slot, nothing to persist
      if (row.gameId === row.savedGameId && row.teamId === row.savedTeamId) continue; // already in sync

      if (row.rowId === null) {
        const result = await savePickemPick(entryId, row.gameId, row.teamId!);
        if (!result.ok) {
          setFailedGame({ gameId: row.gameId, message: result.error });
          setSaving(false);
          return;
        }
        const gameId = row.gameId;
        const teamId = row.teamId;
        const pickId = result.pickId;
        setRows((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], rowId: pickId, savedGameId: gameId, savedTeamId: teamId };
          return next;
        });
      } else {
        const result = await updatePickemPick(entryId, row.rowId, row.gameId, row.teamId!);
        if (!result.ok) {
          setFailedGame({ gameId: row.gameId, message: result.error });
          setSaving(false);
          return;
        }
        const gameId = row.gameId;
        const teamId = row.teamId;
        setRows((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], savedGameId: gameId, savedTeamId: teamId };
          return next;
        });
      }
    }

    setSaving(false);
    setSavedBanner(true);
  }

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">This week&apos;s games</h2>
          <span className="font-data text-sm font-semibold text-pickem-400">
            {pickedCount} of {PICKS_REQUIRED} picked
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Choose any 6 of the games below. Games that have already kicked off are locked in and
          read-only — everything else can still be changed.
        </p>
      </div>

      {savedBanner && (
        <p className="rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">Changes saved.</p>
      )}

      {games.length === 0 ? (
        <p className="text-sm text-muted">No games have been added to the Pick&apos;em pool yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {games.map((game) => {
            const isLocked = new Date(game.kickoffTime).getTime() <= now;
            const isFailed = failedGame?.gameId === game.id;
            const capBlocksThisGame = pickedCount >= pickTarget && !picksByGame[game.id];
            const teamsDisabled = isLocked || saving || capBlocksThisGame;
            const summary = favoriteSummary(game);
            const selectedTeamId = picksByGame[game.id];

            return (
              <div
                key={game.id}
                className={`rounded-lg border p-3 ${
                  isFailed ? "border-dead" : "border-edge bg-surface"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted">
                  <span>
                    {formatScheduleRow(game.kickoffTime)}
                    {game.venue ? ` · ${game.venue}` : ""}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {summary && <span className="font-data text-ink">{summary}</span>}
                    {isLocked && (
                      <span className="rounded bg-edge px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                        Locked
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
                            ? selected
                              ? "cursor-not-allowed border-pickem-500 bg-pickem-500/10 text-pickem-300 opacity-80"
                              : "cursor-not-allowed border-edge opacity-60"
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
                      <button type="button" onClick={handleSave} className="font-semibold underline">
                        Retry
                      </button>
                      <button type="button" onClick={revertFailedGame} className="font-semibold underline">
                        Cancel this change
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {saveError && <p className="rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{saveError}</p>}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-surface px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
        <div className="mx-auto flex max-w-sm items-center justify-between gap-3 sm:max-w-xl md:max-w-3xl">
          <span className="truncate text-xs text-muted">{pickedCount}/{PICKS_REQUIRED} picked</span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !allPicked || Boolean(failedGame)}
            className="flex-shrink-0 rounded-md bg-pickem-500 px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-pickem-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
