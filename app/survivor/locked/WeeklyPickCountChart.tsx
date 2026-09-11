import { isReadableOnDark } from "@/lib/color";

// Horizontal bar chart: for a single Survivor week, how many entries picked
// each SEC team (regular + bonus). Data comes straight from the
// survivor_week_pick_counts view, which already zeroes out counts for any
// team whose game hasn't kicked off yet — this component just renders what
// it's given, same division of labor as TeamAvailabilityChart.

export type WeekPickCountRow = {
  team_id: string;
  school_name: string;
  short_name: string | null;
  primary_color: string | null;
  logo_url: string | null;
  kickoff_time: string | null;
  game_started: boolean;
  pick_count: number;
  bonus_pick_count: number;
  total_pick_count: number;
};

// Same near-black brand color nudge as TeamAvailabilityChart, kept local
// since that one isn't exported.
function barColor(hex: string | null): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "#3a4568";
  if (isReadableOnDark(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lift = (c: number) => Math.round(c + (255 - c) * 0.4);
  return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`;
}

export default function WeeklyPickCountChart({
  weekNumber,
  rows,
}: {
  weekNumber: number;
  rows: WeekPickCountRow[];
}) {
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) =>
    a.school_name.localeCompare(b.school_name, "en", { sensitivity: "base" })
  );

  const byeRows = sorted.filter((r) => r.kickoff_time === null);
  const liveRows = sorted.filter((r) => r.kickoff_time !== null);
  const scaleMax = Math.max(1, ...liveRows.map((r) => r.total_pick_count));
  const allZero = liveRows.length > 0 && liveRows.every((r) => r.total_pick_count === 0);
  const hasBonus = sorted.some((r) => r.bonus_pick_count > 0);

  return (
    <section className="mb-8 rounded-lg border border-edge bg-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Week {weekNumber} pick counts
      </h2>
      <p className="mb-1 mt-0.5 text-xs text-muted">
        How many entries picked each team this week.
      </p>

      {allZero && (
        <p className="mb-3 mt-2 rounded-md border border-edge bg-app px-3 py-2 text-xs text-muted">
          Pick counts appear for each team once that team&apos;s game kicks off.
        </p>
      )}

      {hasBonus && (
        <div className="mb-3 mt-2 flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#3a4568]" /> Regular pick
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-gold-400" /> Bonus pick
          </span>
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {sorted.map((r) => {
          const isBye = r.kickoff_time === null;
          const regularPct = isBye ? 0 : Math.round((r.pick_count / scaleMax) * 100);
          const bonusPct = isBye ? 0 : Math.round((r.bonus_pick_count / scaleMax) * 100);
          const hasAny = !isBye && r.total_pick_count > 0;

          return (
            <li key={r.team_id} className="flex items-center gap-2">
              <div className="flex w-[92px] flex-shrink-0 items-center gap-1.5">
                {r.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.logo_url}
                    alt=""
                    className={`h-4 w-4 flex-shrink-0 rounded-sm bg-white object-contain p-px ${
                      isBye ? "opacity-40" : ""
                    }`}
                  />
                )}
                <span
                  className={`truncate text-[11px] font-medium ${isBye ? "text-muted" : "text-ink"}`}
                >
                  {r.short_name || r.school_name}
                </span>
              </div>

              <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-app">
                {hasAny && (
                  <div className="flex h-full w-full">
                    <div
                      className="h-full outline outline-1 -outline-offset-1 outline-white/20"
                      style={{ width: `${regularPct}%`, backgroundColor: barColor(r.primary_color) }}
                    />
                    {r.bonus_pick_count > 0 && (
                      <div
                        className="h-full outline outline-1 -outline-offset-1 outline-white/20"
                        style={{ width: `${bonusPct}%` }}
                      >
                        <div className="h-full w-full bg-gold-400" />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <span className="w-8 flex-shrink-0 text-right font-data text-[11px] tabular-nums text-muted">
                {isBye ? "—" : r.total_pick_count}
              </span>
            </li>
          );
        })}
      </ul>

      {byeRows.length > 0 && (
        <p className="mt-3 text-[11px] text-muted">
          &mdash; = bye week, no game to pick against.
        </p>
      )}
    </section>
  );
}
