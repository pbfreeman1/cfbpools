"use client";

import { useMemo, useState } from "react";
import PickCell, { type PickCellData } from "@/app/survivor/PickCell";

export type LockedRow = {
  entryId: string;
  entryName: string;
  eliminated: boolean;
  pick: PickCellData;
};

export type LockedWeek = {
  weekNumber: number;
  rows: LockedRow[];
};

export default function LockedPicksList({ weeks }: { weeks: LockedWeek[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return weeks;
    return weeks
      .map((w) => ({
        ...w,
        rows: w.rows.filter((r) => r.entryName.toLowerCase().includes(q)),
      }))
      .filter((w) => w.rows.length > 0);
  }, [weeks, query]);

  if (weeks.length === 0) {
    return <p className="text-sm text-muted">No picks are locked yet.</p>;
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by entry name"
        className="mb-6 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-gold-400 focus:outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No entries match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {filtered.map((w) => (
            <div key={w.weekNumber}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                Week {w.weekNumber}
              </h2>
              <ul className="flex flex-col gap-2">
                {w.rows.map((r) => (
                  <li
                    key={r.entryId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-surface px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{r.entryName}</p>
                      <span
                        className={
                          r.eliminated
                            ? "text-xs font-medium text-dead"
                            : "text-xs font-medium text-alive"
                        }
                      >
                        {r.eliminated ? "Eliminated" : "Alive"}
                      </span>
                    </div>
                    <PickCell pick={r.pick} className={r.eliminated ? "opacity-50" : ""} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
