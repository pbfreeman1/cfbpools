"use client";

import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";

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
  // Week the entry lost (null while alive). Picks after this week are
  // leftovers that never counted, so the table shows them as "out" dashes.
  eliminatedWeek: number | null;
  picksByWeek: Record<number, LockedPick>;
};

// Layout: ONE shared horizontal scroller for the whole table.
//
//   [ sticky header:  Entry | (scroller) Bonus Wk1 Wk2 ... ]
//   [ body:           names | (scroller) cells ............ ]
//
// The name column is a genuinely separate flex sibling OUTSIDE the scroller
// (never `position: sticky` on cells — unreliable mid-scroll on mobile
// Safari, per the project convention), so it cannot drift. Every row has the
// same fixed height, so the two halves stay aligned without JS measuring.
// The header is a vertical-sticky sibling above the body (sticky on a plain
// div at page level, not on table cells) and its own scroller mirrors the
// body's scrollLeft, so the week labels move with the columns beneath them
// and stay on screen while you scroll down through the entries.

const NAME_W = 132;
const BONUS_W = 52;
const COL_W = 52;
const HEAD_H = 36;
const ROW_H = 58;

function Logo({ src, size }: { src: string | null; size: number }) {
  if (!src) return <span style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" style={{ width: size, height: size }} className="object-contain" />;
}

function PickCell({
  pick,
  week,
  entry,
}: {
  pick?: LockedPick;
  week: number;
  entry: LockedEntry;
}) {
  // Out of the pool by this week: whatever sits in the data never counted.
  if (entry.eliminatedWeek !== null && week > entry.eliminatedWeek) {
    return <span className="text-xs text-edge">&ndash;</span>;
  }
  if (!pick) return <span className="text-xs text-edge">&ndash;</span>;

  const lostHere = entry.eliminatedWeek === week;
  const ring = lostHere ? "ring-2 ring-dead" : pick.isBonus ? "ring-1 ring-gold-500" : "ring-1 ring-black/10";

  const title = pick.isBonus
    ? `${pick.shortName} + ${pick.bonusShortName ?? "?"} — bonus week (both had to win)${
        lostHere ? " — eliminated" : ""
      }`
    : `${pick.shortName}${lostHere ? " — eliminated" : ""}`;

  return (
    <div title={title} className="relative">
      {pick.isBonus ? (
        // Bonus week: both logos stacked, as in the reference design.
        <div
          className={`flex h-[46px] w-9 flex-col items-center justify-center gap-0.5 rounded-md bg-white ${ring}`}
        >
          <Logo src={pick.logoUrl} size={17} />
          <span className="h-px w-5 bg-black/15" />
          <Logo src={pick.bonusLogoUrl} size={17} />
        </div>
      ) : (
        <div className={`flex h-9 w-9 items-center justify-center rounded-md bg-white ${ring}`}>
          <Logo src={pick.logoUrl} size={24} />
        </div>
      )}

      {pick.isBonus && !lostHere && (
        <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-yellow-400 text-[8px] leading-none text-yellow-900 shadow-sm">
          ★
        </span>
      )}
      {lostHere && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-dead text-[9px] font-bold leading-none text-white shadow-sm">
          &#10005;
        </span>
      )}
    </div>
  );
}

type StatusFilter = "all" | "alive" | "eliminated";

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const headerScroll = useRef<HTMLDivElement | null>(null);
  const bodyScroll = useRef<HTMLDivElement | null>(null);

  // Keep header and body scrollers in lock-step (direct DOM writes — no
  // React state, so no re-render per scrolled pixel). Guarding on equality
  // stops the two onScroll handlers from ping-ponging.
  function mirrorTo(targetRef: { current: HTMLDivElement | null }) {
    return (event: UIEvent<HTMLDivElement>) => {
      const left = event.currentTarget.scrollLeft;
      const target = targetRef.current;
      if (target && target.scrollLeft !== left) target.scrollLeft = left;
    };
  }

  // Open scrolled to the newest weeks — that's what people come back to
  // check — instead of the long-finished Week 1 columns.
  useEffect(() => {
    const body = bodyScroll.current;
    if (!body) return;
    body.scrollLeft = body.scrollWidth;
    if (headerScroll.current) headerScroll.current.scrollLeft = body.scrollWidth;
  }, [weekNumbers.length, entries.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (statusFilter === "alive" && e.eliminated) return false;
      if (statusFilter === "eliminated" && !e.eliminated) return false;
      if (!q) return true;
      return (
        e.entryName.toLowerCase().includes(q) || (e.ownerName ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, query, statusFilter]);

  if (entries.length === 0 || weekNumbers.length === 0) {
    return <p className="text-sm text-muted">No picks are locked yet.</p>;
  }

  const gridWidth = BONUS_W + weekNumbers.length * COL_W;
  const rowShade = (i: number) => (i % 2 === 1 ? "bg-app/40" : "bg-surface");
  const latestWeek = weekNumbers[weekNumbers.length - 1];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entry or player"
          className="w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-gold-400 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-ink focus:border-gold-400 focus:outline-none sm:w-44"
        >
          <option value="all">All entries</option>
          <option value="alive">Alive only</option>
          <option value="eliminated">Eliminated only</option>
        </select>
        {(query || statusFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("all");
            }}
            className="rounded-md border border-edge px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-hover"
          >
            Reset
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No entries match those filters.</p>
      ) : (
        <div className="rounded-lg border border-edge bg-surface">
          {/* Sticky header: stays on screen while the page scrolls down, and
              its week labels scroll sideways with the cells below. */}
          <div
            className="sticky top-0 z-20 flex rounded-t-lg border-b border-edge bg-surface shadow-sm"
            style={{ height: HEAD_H }}
          >
            <div
              className="flex flex-shrink-0 items-center border-r border-edge px-3 text-[10px] font-semibold uppercase tracking-wide text-muted"
              style={{ width: NAME_W }}
            >
              Entry
            </div>
            <div
              ref={headerScroll}
              onScroll={mirrorTo(bodyScroll)}
              className="no-scrollbar flex-1 overflow-x-auto"
            >
              <div className="flex h-full items-center" style={{ width: gridWidth }}>
                <div
                  className="text-center font-data text-[10px] font-medium uppercase text-muted"
                  style={{ width: BONUS_W }}
                >
                  Bonus
                </div>
                {weekNumbers.map((w) => (
                  <div
                    key={w}
                    className={`text-center font-data text-[11px] font-semibold uppercase ${
                      w === latestWeek ? "text-gold-400" : "text-muted"
                    }`}
                    style={{ width: COL_W }}
                  >
                    Wk{w}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex">
            {/* Fixed name column — outside the scroller on purpose. */}
            <div className="flex-shrink-0 border-r border-edge" style={{ width: NAME_W }}>
              {filtered.map((e, i) => (
                <div
                  key={e.entryId}
                  className={`flex flex-col justify-center gap-0.5 px-3 ${rowShade(i)} ${
                    i < filtered.length - 1 ? "border-b border-edge/60" : ""
                  }`}
                  style={{ height: ROW_H }}
                >
                  <span className="line-clamp-2 break-words text-xs font-semibold leading-tight text-ink">
                    {e.entryName}
                  </span>
                  <span className="truncate text-[10px] leading-tight">
                    {e.ownerName && <span className="text-muted">{e.ownerName} &middot; </span>}
                    <span className={e.eliminated ? "text-dead" : "text-alive"}>
                      {e.eliminated ? "Elim" : "Alive"}
                    </span>
                  </span>
                </div>
              ))}
            </div>

            {/* One shared scroller for every row's cells. */}
            <div
              ref={bodyScroll}
              onScroll={mirrorTo(headerScroll)}
              className="no-scrollbar flex-1 overflow-x-auto"
            >
              <div style={{ width: gridWidth }}>
                {filtered.map((e, i) => (
                  <div
                    key={e.entryId}
                    className={`flex items-center ${rowShade(i)} ${
                      i < filtered.length - 1 ? "border-b border-edge/60" : ""
                    }`}
                    style={{ height: ROW_H }}
                  >
                    <div
                      className="flex justify-center"
                      style={{ width: BONUS_W }}
                      title="Bonus picks finalized"
                    >
                      <span className="rounded bg-app px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted">
                        {e.bonusFinalizedCount}/2
                      </span>
                    </div>
                    {weekNumbers.map((w) => (
                      <div key={w} className="flex justify-center" style={{ width: COL_W }}>
                        <PickCell pick={e.picksByWeek[w]} week={w} entry={e} />
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
        <span className="font-medium text-ink">Swipe the table sideways</span> for other weeks.
        &#9733; = bonus week (stacked logos, both had to win) &middot;{" "}
        <span className="text-dead">&#10005;</span> = lost that week &middot; &ndash; = no pick /
        already out.
      </p>
      <p className="mt-1 text-xs text-muted">
        {filtered.length} of {entries.length} entries shown &middot; {totalActiveEntries} still
        alive.
      </p>
    </div>
  );
}
