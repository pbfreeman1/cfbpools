export type WeekStripItem = {
  weekNumber: number;
  locked: boolean;
  hasPick: boolean;
  isBonusWeek: boolean;
  /** If set, this item renders as an anchor link instead of a stateful button — jump-to-section navigation (e.g. the schedule page) rather than swapping client state. */
  href?: string;
};

/**
 * The horizontal week-selector strip shared across the Pick Tool, Bonus Pick
 * Tool, and the SEC schedule page, so week navigation reads the same way
 * everywhere. Two modes: stateful select (button + onSelect, used by the pick
 * tools to swap client state) or link (anchor href, used by the schedule page
 * to jump to a section) — set per item via `href`.
 */
export default function WeekSelectorStrip({
  weeks,
  selectedWeekNumber,
  onSelect,
}: {
  weeks: WeekStripItem[];
  selectedWeekNumber?: number;
  onSelect?: (weekNumber: number) => void;
}) {
  return (
    <div className="no-scrollbar -mx-6 mb-6 flex gap-2 overflow-x-auto px-6 pb-1">
      {weeks.map((w) => {
        const isSelected = w.weekNumber === selectedWeekNumber;
        const className =
          "flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border text-xs font-semibold transition " +
          (isSelected
            ? "border-gold-500 bg-gold-500/10 text-gold-400"
            : w.locked
              ? "border-edge bg-app text-muted opacity-60"
              : "border-edge text-ink hover:bg-surface-hover");
        const content = (
          <>
            <span>Wk {w.weekNumber}</span>
            <span className="text-[10px] leading-none">
              {w.hasPick ? (w.isBonusWeek ? "★" : "✓") : w.locked ? "✕" : ""}
            </span>
          </>
        );

        if (w.href) {
          return (
            <a key={w.weekNumber} href={w.href} className={className}>
              {content}
            </a>
          );
        }

        return (
          <button
            key={w.weekNumber}
            type="button"
            onClick={() => onSelect?.(w.weekNumber)}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
