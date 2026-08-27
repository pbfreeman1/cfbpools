"use client";

import { useEffect, useRef, useState } from "react";
import {
  getPickemLeaderboard,
  getLastPickemSyncTime,
  type LeaderboardRow,
} from "@/app/actions/pickem";
import { formatTimeOnly } from "@/lib/formatDate";
import { EntryRecordBadges } from "@/app/pickem/components/EntryRecordBadges";
import { EliminatedBadge } from "@/app/pickem/components/EliminatedBadge";
import { ExpandablePicks } from "@/app/pickem/components/ExpandablePicks";
import GamesPanel, { type PickemGameStatus } from "./GamesPanel";

// MVP polling interval — good enough to feel "live" during game windows
// without needing Realtime. The data only ever changes when the grading
// function runs, so anything in the 30-60s range is fine.
const POLL_MS = 45000;

export default function LeaderboardTable({
  scheduleId,
  initialRows,
  initialLastSync,
  games,
}: {
  scheduleId: string;
  initialRows: LeaderboardRow[];
  initialLastSync: string | null;
  games: PickemGameStatus[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [lastSync, setLastSync] = useState<string | null>(initialLastSync);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isFetching = useRef(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (isFetching.current) return;
      isFetching.current = true;
      try {
        const [next, syncTime] = await Promise.all([
          getPickemLeaderboard(scheduleId),
          getLastPickemSyncTime(),
        ]);
        if (next === null) {
          // Transient failure — keep showing whatever was last successfully
          // loaded rather than clobbering it with an empty board. Self-heals
          // on the next successful poll.
          setRefreshFailed(true);
        } else {
          setRows(next);
          setRefreshFailed(false);
        }
        // syncTime is independent — a null here just means grading hasn't run
        // (or that one RPC failed); don't let it flip refreshFailed.
        if (syncTime) setLastSync(syncTime);
      } catch {
        // The server action call itself failed (e.g. offline) rather than
        // returning a handled error — same "keep the stale data" treatment.
        setRefreshFailed(true);
      } finally {
        isFetching.current = false;
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [scheduleId]);

  return (
    <div>
      <GamesPanel games={games} />

      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"}
        </span>
        <span className="text-xs text-muted">
          {lastSync ? `Updated ${formatTimeOnly(lastSync)}` : "Not yet graded"}
          {refreshFailed && <span className="text-dead"> — couldn&apos;t refresh</span>}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          No entries yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const isExpanded = expandedId === row.entryId;
            return (
              <div
                key={row.entryId}
                className={`rounded-lg border px-3 py-2.5 ${
                  row.isOwn ? "border-pickem-500 bg-pickem-500/5" : "border-edge bg-surface"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : row.entryId)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <span className="w-8 flex-shrink-0 text-center font-data text-sm font-semibold text-muted">
                    #{row.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{row.entryName}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {row.isOwn && (
                        <span className="inline-block rounded bg-pickem-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pickem-400">
                          You
                        </span>
                      )}
                      <EliminatedBadge effectiveLosses={row.effectiveLosses} />
                    </div>
                  </div>
                  <EntryRecordBadges
                    wins={row.wins}
                    effectiveLosses={row.effectiveLosses}
                    liveWins={row.liveWins}
                    liveLosses={row.liveLosses}
                  />
                  <span className="flex-shrink-0 text-xs text-muted">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>

                <ExpandablePicks entryId={row.entryId} open={isExpanded} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
