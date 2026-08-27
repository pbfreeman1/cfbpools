"use client";

import { useEffect, useState } from "react";
import {
  getPickemEntryPicks,
  type PickemEntryPickDetail,
} from "@/app/actions/pickem";
import { spreadForTeam } from "./GameCard";
import { GameMatchupLine } from "@/app/components/MatchupLine";
import { formatScheduleRow } from "@/lib/formatDate";

// The collapsible per-entry pick list beneath a leaderboard row / homepage
// entry. Controlled open/closed by the parent (which owns the toggle UI, so
// the whole leaderboard row stays clickable without a nested button). The
// fetch is lazy — fired the first time `open` goes true — and cached, so
// the 45s leaderboard poll never refetches it.
//
// Games that haven't kicked off are never returned by get_pickem_entry_picks,
// so there's nothing to render for them here — no placeholder row.

type PickState = "final-win" | "final-loss" | "live-win" | "live-loss";

function pickState(pick: PickemEntryPickDetail): PickState | null {
  if (pick.result === "win") return "final-win";
  if (pick.result === "loss" || pick.result === "push") return "final-loss";
  if (pick.liveResult === "win") return "live-win";
  if (pick.liveResult === "loss" || pick.liveResult === "push") return "live-loss";
  return null;
}

const STATE_STYLES: Record<PickState, string> = {
  "final-win": "bg-alive/10 text-alive",
  "final-loss": "bg-dead/10 text-dead",
  "live-win": "bg-alive/5 text-alive/80 italic",
  "live-loss": "bg-dead/5 text-dead/80 italic",
};

function resultLabel(pick: PickemEntryPickDetail): string {
  if (pick.result === "win") return "W";
  if (pick.result === "loss") return "L";
  if (pick.result === "push") return "Push";
  if (pick.liveResult === "win") return "W · unofficial";
  if (pick.liveResult === "loss") return "L · unofficial";
  if (pick.liveResult === "push") return "Push · unofficial";
  return "";
}

export function ExpandablePicks({
  entryId,
  open,
}: {
  entryId: string;
  open: boolean;
}) {
  const [picks, setPicks] = useState<PickemEntryPickDetail[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumped to force a retry after a failed fetch. The fetch itself fires
  // once the first time the row is opened; on success the result is cached
  // and the 45s leaderboard poll never refetches it.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Nothing to do unless the row is open, we don't already have data, and
    // we're not mid-flight. `attempt` in the deps is what lets Retry re-run.
    if (!open || picks !== null || loading) return;

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getPickemEntryPicks(entryId)
      .then((result) => {
        if (cancelled) return;
        if (result === null) setFailed(true);
        else setPicks(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entryId, attempt]);

  if (!open) return null;

  return (
    <div className="mt-2 border-t border-edge pt-2">
      {loading && <p className="px-1 py-2 text-xs text-muted">Loading picks…</p>}

      {!loading && failed && (
        <p className="px-1 py-2 text-xs text-dead">
          Couldn&apos;t load picks.{" "}
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((a) => a + 1);
            }}
            className="font-semibold underline"
          >
            Retry
          </button>
        </p>
      )}

      {!loading && !failed && picks?.length === 0 && (
        <p className="px-1 py-2 text-xs text-muted">
          No games in this entry have started yet.
        </p>
      )}

      {!loading && !failed && picks && picks.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {picks.map((pick) => {
            const state = pickState(pick);
            const spread = spreadForTeam(
              pick.effectiveSpread,
              pick.homeTeam.id,
              pick.pickedTeamId
            );
            const pickedIsHome = pick.pickedTeamId === pick.homeTeam.id;
            const scoreKnown = pick.homeScore !== null && pick.awayScore !== null;
            return (
              <li
                key={pick.gameId}
                className="flex items-center justify-between gap-2 rounded-md border border-edge bg-app px-2.5 py-2"
              >
                <div className="min-w-0">
                  <GameMatchupLine
                    home={{
                      id: pick.homeTeam.id,
                      name: pick.homeTeam.name,
                      logo_url: pick.homeTeam.logoUrl,
                    }}
                    away={{
                      id: pick.awayTeam.id,
                      name: pick.awayTeam.name,
                      logo_url: pick.awayTeam.logoUrl,
                    }}
                  />
                  <p className="mt-0.5 text-[11px] text-muted">
                    Pick: {pickedIsHome ? pick.homeTeam.name : pick.awayTeam.name}
                    {spread ? ` ${spread}` : ""}
                    {scoreKnown ? ` · ${pick.awayScore}-${pick.homeScore}` : ""}
                    {!scoreKnown ? ` · ${formatScheduleRow(pick.kickoffTime)}` : ""}
                  </p>
                </div>
                {state && (
                  <span
                    className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATE_STYLES[state]}`}
                  >
                    {resultLabel(pick)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
