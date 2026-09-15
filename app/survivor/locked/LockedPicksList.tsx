"use client";

import { useMemo, useState } from "react";

export type LockedPick = {
  shortName: string;
  logoUrl: string | null;
  isBonus: boolean;
  bonusShortName: string | null;
  bonusLogoUrl: string | null;
};

export type LockedEntry = {
  entryId: string;
  entryName: string;
  ownerName: string | null;
  bonusFinalizedCount: number;
  eliminated: boolean;
  picksByWeek: Record<number, LockedPick>;
};

// One column per locked week, one row per entry. The entry-name column is a
// genuinely separate flex-shrink-0 sibling OUTSIDE the horizontally
// scrolling week grid (never `position: sticky` — unreliable mid-scroll on
// mobile Safari, per the project convention). Row heights + alternating
// shading are kept in lockstep between the two halves by iterating the same
// filtered list with the same index in both.

const COL_W = 48;
const ROW_H = 54;
const HEAD_H = 34;

function PickBox({ pick, dim }: { pick?: LockedPick; dim: boolean }) {
  if (!pick) return <span className="text-xs text-edge">&ndash;</span>;

  const dimCls = dim ? "opacity-45" : "";

  if (pick.isBonus) {
    return (
      <div
        title={`${pick.shortName} + ${pick.bonusShortName ?? "?"} — bonus week (both had to win)`}
        className={`relative flex h-9 w-9 ${dimCls}`}
      >
        {/* Clips the split-logo halves only — the badge below is a sibling
            outside this box so it can overlay past the card's edge instead
            of getting clipped along with it. */}
        <div className="flex h-9 w-9 overflow-hidden rounded-md bg-white ring-1 ring-gold-500">
          <div className="flex w-1/2 items-center justify-center border-r border-black/15">
            {pick.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pick.logoUrl} alt="" className="h-4 w-4 object-contain" />
            )}
          </div>
          <div className="flex w-1/2 items-center justify-center">
            {pick.bonusLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pick.bonusLogoUrl} alt="" className="h-4 w-4 object-contain" />
            )}
          </div>
        </div>

        <span className="absolute -top-1.5 -right-1.5 inline-flex items-center gap-0.5 rounded-full bg-yellow-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-yellow-900 shadow-sm">
          ⭐ Bonus
        </span>
      </div>
    );
  }

  return (
    <div
      title={pick.shortName}
      className={`flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white ${dimCls}`}
    >
      {pick.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pick.logoUrl} alt="" className="h-6 w-6 object-contain" />
      )}
    </div>
  );
}

export default function LockedPicksList({
  weekNumbers,
  entries,
  totalActiveEntries,
}: {
  weekNumbers: number[];
  entries: LockedEntry[];
  totalActiveEntries: number;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.entryName.toLowerCase().includes(q));
  }, [entries, query]);

  if (entries.length === 0 || weekNumbers.length === 0) {
    return <p className="text-sm text-muted">No picks are locked yet.</p>;
  }

  const gridWidth = weekNumbers.length * COL_W;
  const rowShade = (i: number) => (i % 2 === 1 ? "bg-app/40" : "");

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by entry name"
        className="mb-4 w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-gold-400 focus:outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No entries match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-edge bg-surface">
          <div className="flex">
            {/* Fixed entry-name column */}
            <div className="flex-shrink-0 border-r border-edge" style={{ width: 152 }}>
              <div
                className="flex items-end px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted"
                style={{ height: HEAD_H }}
              >
                Entry
              </div>
              {filtered.map((e, i) => (
                <div
                  key={e.entryId}
                  className={`flex flex-col justify-center gap-0.5 px-3 ${rowShade(i)}`}
                  style={{ height: ROW_H }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-ink">{e.entryName}</span>
                    <span
                      title="Bonus picks finalized"
                      className="shrink-0 rounded bg-app px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-muted"
                    >
                      {e.bonusFinalizedCount}/2
                    </span>
                  </div>
                  <div className="flex items-center gap-1 overflow-hidden text-[10px]">
                    {e.ownerName && (
                      <>
                        <span className="truncate text-muted">{e.ownerName}</span>
                        <span className="text-muted">&middot;</span>
                      </>
                    )}
                    <span className={e.eliminated ? "text-dead" : "text-alive"}>
                      {e.eliminated ? "Eliminated" : "Alive"}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Scrollable week grid */}
            <div className="flex-1 overflow-x-auto">
              <div style={{ width: gridWidth }}>
                <div
                  className="flex items-end border-b border-edge pb-1"
                  style={{ height: HEAD_H }}
                >
                  {weekNumbers.map((w) => (
                    <div
                      key={w}
                      className="text-center font-data text-[10px] font-medium uppercase text-muted"
                      style={{ width: COL_W }}
                    >
                      Wk{w}
                    </div>
                  ))}
                </div>

                {filtered.map((e, i) => (
                  <div
                    key={e.entryId}
                    className={`flex items-center ${rowShade(i)}`}
                    style={{ height: ROW_H }}
                  >
                    {weekNumbers.map((w) => (
                      <div key={w} className="flex justify-center" style={{ width: COL_W }}>
                        <PickBox pick={e.picksByWeek[w]} dim={e.eliminated} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-muted">
        {query.trim() ? (
          <>
            {filtered.length} match{filtered.length === 1 ? "" : "es"} &ldquo;{query}&rdquo;
            {" "}(of {totalActiveEntries} total active entries).
          </>
        ) : (
          <>
            {totalActiveEntries} total active entries &middot; {entries.length} with a locked
            pick shown.
          </>
        )}
      </p>
    </div>
  );
}
