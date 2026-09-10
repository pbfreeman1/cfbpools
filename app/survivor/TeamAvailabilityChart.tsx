import { isReadableOnDark } from "@/lib/color";

// Horizontal bar chart on the Survivor home page: for every SEC team, how
// many still-active entries have NOT used that team yet and could still
// pick it. Data comes from the survivor_team_availability view, which is
// the same "has this entry used this team" logic the pick tools enforce —
// not a second parallel calculation.
//
// Pure server component, plain divs (no chart lib in this project). Sized
// for phones first: one compact row per team, the whole list scrolls with
// the page rather than trying to fit 16 teams in a short viewport.

export type TeamAvailabilityRow = {
  team_id: string;
  school_name: string;
  short_name: string | null;
  primary_color: string | null;
  logo_url: string | null;
  active_entries: number;
  available_count: number;
};

// Nudge near-black brand colors (Vanderbilt, Auburn, Texas A&M, Ole Miss…)
// toward something that still reads as a filled bar on the dark surface.
function barColor(hex: string | null): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "#3a4568";
  if (isReadableOnDark(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lift = (c: number) => Math.round(c + (255 - c) * 0.4);
  return `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`;
}

export default function TeamAvailabilityChart({ rows }: { rows: TeamAvailabilityRow[] }) {
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) =>
    a.school_name.localeCompare(b.school_name, "en", { sensitivity: "base" })
  );
  const scaleMax = Math.max(1, ...sorted.map((r) => r.available_count));

  return (
    <section className="mb-8 rounded-lg border border-edge bg-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Teams still available
      </h2>
      <p className="mb-4 mt-0.5 text-xs text-muted">
        Active entries that haven&apos;t used each team yet (based on completed weeks).
      </p>

      <ul className="flex flex-col gap-1.5">
        {sorted.map((r) => {
          const pct = Math.max(2, Math.round((r.available_count / scaleMax) * 100));
          return (
            <li key={r.team_id} className="flex items-center gap-2">
              <div className="flex w-[92px] flex-shrink-0 items-center gap-1.5">
                {r.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.logo_url}
                    alt=""
                    className="h-4 w-4 flex-shrink-0 rounded-sm bg-white object-contain p-px"
                  />
                )}
                <span className="truncate text-[11px] font-medium text-ink">
                  {r.short_name || r.school_name}
                </span>
              </div>

              <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-app">
                <div
                  className="h-full rounded-sm outline outline-1 -outline-offset-1 outline-white/20"
                  style={{ width: `${pct}%`, backgroundColor: barColor(r.primary_color) }}
                />
              </div>

              <span className="w-8 flex-shrink-0 text-right font-data text-[11px] tabular-nums text-muted">
                {r.available_count}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
