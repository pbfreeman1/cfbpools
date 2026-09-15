"use client";

import { useMemo, useRef, useState, type UIEvent } from "react";

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

// One column per locked week, one row per entry. Each row is its own flex
// container: a fixed-width name cell (which must be free to wrap to a
// second line for long names) directly followed by that row's own
// overflow-x-auto week grid — never `position: sticky` — unreliable
// mid-scroll on mobile Safari, per the project convention. Because the name
// cell can grow taller than the pick-cell row's own content, they can't be
// two independent same-height stacks any more (a wrapped name would push
// every row below it out of alignment) — each row's two halves are true
// flex siblings instead, so the browser sizes the row to fit whichever side
// is taller. The tradeoff: each row's week grid is its own scroll container,
// so horizontal scroll position is kept in sync across all of them (plus
// the header) via a plain scrollLeft mirror on scroll — no React state,
// just direct DOM writes, so it doesn't re-render on every scroll pixel.

const COL_W = 48;
const HEAD_H = 34;
// Floor, not a fixed height — a row grows past this when its name wraps.
const MIN_ROW_H = 54;

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

        <span
          title="Bonus week"
          className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-yellow-400 text-[8px] leading-none text-yellow-900 shadow-sm"
        >
          ★
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

  // Every row's own week-grid scroll container (plus the header's),
  // registered by a stable key so scrolling any one of them can mirror its
  // scrollLeft onto all the others.
  const scrollEls = useRef<Map<string, HTMLDivElement>>(new Map());

  function registerScrollEl(key: string) {
    return (el: HTMLDivElement | null) => {
      if (el) scrollEls.current.set(key, el);
      else scrollEls.current.delete(key);
    };
  }

  function handleScroll(sourceKey: string) {
    return (event: UIEvent<HTMLDivElement>) => {
      const left = event.currentTarget.scrollLeft;
      scrollEls.current.forEach((el, key) => {
        if (key !== sourceKey && el.scrollLeft !== left) el.scrollLeft = left;
      });
    };
  }

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
          {/* Header row */}
          <div className="flex border-b border-edge">
            <div
              className="flex flex-shrink-0 items-end px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted"
              style={{ width: 152, height: HEAD_H }}
            >
              Entry
            </div>
            <div
              className="flex-1 overflow-x-auto"
              ref={registerScrollEl("header")}
              onScroll={handleScroll("header")}
            >
              <div className="flex items-end pb-1" style={{ width: gridWidth, height: HEAD_H }}>
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
            </div>
          </div>

          {/* One flex row per entry: a wrap-capable name cell plus that
              row's own scrollable week grid, so a taller (wrapped) name
              only grows its own row instead of misaligning every row below
              it. */}
          {filtered.map((e, i) => (
            <div
              key={e.entryId}
              className={`flex items-stretch ${rowShade(i)} ${
                i < filtered.length - 1 ? "border-b border-edge/60" : ""
              }`}
            >
              <div
                className="flex flex-shrink-0 flex-col justify-center gap-0.5 px-3 py-2"
                style={{ width: 152 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-xs font-medium text-ink">
                    {e.entryName}
                  </span>
                  <span
                    title="Bonus picks finalized"
                    className="shrink-0 rounded bg-app px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-muted"
                  >
                    {e.bonusFinalizedCount}/2
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-1 text-[10px]">
                  {e.ownerName && (
                    <>
                      <span className="text-muted">{e.ownerName}</span>
                      <span className="text-muted">&middot;</span>
                    </>
                  )}
                  <span className={e.eliminated ? "text-dead" : "text-alive"}>
                    {e.eliminated ? "Eliminated" : "Alive"}
                  </span>
                </div>
              </div>

              <div
                className="flex-1 overflow-x-auto"
                ref={registerScrollEl(e.entryId)}
                onScroll={handleScroll(e.entryId)}
              >
                <div
                  className="flex h-full items-center"
                  style={{ width: gridWidth, minHeight: MIN_ROW_H }}
                >
                  {weekNumbers.map((w) => (
                    <div key={w} className="flex justify-center" style={{ width: COL_W }}>
                      <PickBox pick={e.picksByWeek[w]} dim={e.eliminated} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
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
            {totalActiveEntries} total active entries &middot; {entries.length} shown (including
            eliminated).
          </>
        )}
      </p>
    </div>
  );
}
