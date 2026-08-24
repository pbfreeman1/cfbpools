"use client";

import { useEffect, useRef, useState } from "react";
import { getPickemLeaderboard, type LeaderboardRow } from "@/app/actions/pickem";
import { formatTimeOnly } from "@/lib/formatDate";

// MVP polling interval — good enough to feel "live" during game windows
// without needing Realtime. The data only ever changes when the grading
// function runs, so anything in the 30-60s range is fine.
const POLL_MS = 45000;

function RecordCell({ row }: { row: LeaderboardRow }) {
  return (
    <div className="flex-shrink-0 text-right">
      <p className="font-data text-sm font-semibold text-ink">
        {row.wins}-{row.effectiveLosses}
      </p>
      {row.pushes > 0 && (
        <p className="text-[11px] text-muted">
          ({row.pushes} push{row.pushes === 1 ? "" : "es"})
        </p>
      )}
      {row.pending > 0 && <p className="text-[11px] text-muted">{row.pending} pending</p>}
    </div>
  );
}

export default function LeaderboardTable({
  scheduleId,
  initialRows,
}: {
  scheduleId: string;
  initialRows: LeaderboardRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date());
  const [refreshFailed, setRefreshFailed] = useState(false);
  const isFetching = useRef(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (isFetching.current) return;
      isFetching.current = true;
      try {
        const next = await getPickemLeaderboard(scheduleId);
        if (next === null) {
          // Transient failure — keep showing whatever was last successfully
          // loaded rather than clobbering it with an empty board. Self-heals
          // on the next successful poll.
          setRefreshFailed(true);
        } else {
          setRows(next);
          setLastUpdated(new Date());
          setRefreshFailed(false);
        }
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
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"}
        </span>
        {lastUpdated && (
          <span className="text-xs text-muted">
            Updated {formatTimeOnly(lastUpdated)}
            {refreshFailed && <span className="text-dead"> — couldn&apos;t refresh</span>}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          No entries yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div
              key={row.entryId}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                row.isOwn ? "border-pickem-500 bg-pickem-500/5" : "border-edge bg-surface"
              }`}
            >
              <span className="w-8 flex-shrink-0 text-center font-data text-sm font-semibold text-muted">
                #{row.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{row.entryName}</p>
                {row.isOwn && (
                  <span className="mt-0.5 inline-block rounded bg-pickem-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-pickem-400">
                    You
                  </span>
                )}
              </div>
              <RecordCell row={row} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
