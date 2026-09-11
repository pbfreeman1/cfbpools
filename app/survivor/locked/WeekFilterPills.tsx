import Link from "next/link";

// Plain link-based pill row for picking which week's pick-count chart to
// view. Deliberately not WeekSelectorStrip — that component's pills carry
// per-entry pick/lock semantics (✓/✕/★) that don't apply to a pool-wide
// stats filter, and each pill here is a real navigation (?week=N) rather
// than client-side state, so the selection is linkable and survives a
// refresh.

export default function WeekFilterPills({
  weekNumbers,
  selectedWeek,
  currentWeek,
}: {
  weekNumbers: number[];
  selectedWeek: number;
  currentWeek: number;
}) {
  return (
    <div className="no-scrollbar -mx-6 mb-3 flex gap-2 overflow-x-auto px-6 pb-1">
      {weekNumbers.map((w) => {
        const isSelected = w === selectedWeek;
        return (
          <Link
            key={w}
            href={`/survivor/locked?week=${w}`}
            className={
              "relative flex h-10 w-14 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border text-xs font-semibold transition " +
              (isSelected
                ? "border-gold-500 bg-gold-500/10 text-gold-400"
                : "border-edge text-ink hover:bg-surface-hover")
            }
          >
            {w === currentWeek && (
              <span
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-gold-400"
                title="Current week"
              />
            )}
            <span>Wk {w}</span>
          </Link>
        );
      })}
    </div>
  );
}
