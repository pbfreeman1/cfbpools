import { isReadableOnDark } from "@/lib/color";

// Shared 56×56 "this week's pick" cell used by the survivor home entry grid
// (app/survivor/page.tsx) and the /survivor/locked reveal page. Renders the
// same visual language in both places:
//   - regular pick → team logo + color dot + short name
//   - bonus week   → split diagonal gradient of the two teams' colors, with
//                    each team's logo tucked into opposite corners
// This is the pure pick visual only — callers own any surrounding link /
// locked-dimming / "no pick" placeholder behavior.

export type PickCellData = {
  shortName: string;
  logoUrl: string | null;
  color: string | null;
  isBonus: boolean;
  bonusShortName: string | null;
  bonusLogoUrl: string | null;
  bonusColor: string | null;
};

export function pickCellTitle(pick: PickCellData): string {
  return pick.isBonus && pick.bonusShortName
    ? `${pick.shortName} + ${pick.bonusShortName} (bonus)`
    : pick.shortName;
}

export default function PickCell({
  pick,
  className = "",
}: {
  pick: PickCellData;
  className?: string;
}) {
  const base =
    "relative flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border border-edge bg-surface text-center";

  if (pick.isBonus) {
    return (
      <div
        title={pickCellTitle(pick)}
        style={{
          background: `linear-gradient(135deg, ${pick.color || "#232B45"} 50%, ${
            pick.bonusColor || "#3a4568"
          } 50%)`,
        }}
        className={`${base} ${className}`}
      >
        {pick.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pick.logoUrl}
            alt=""
            className="absolute left-2 top-2 h-5 w-5 object-contain drop-shadow"
          />
        )}
        {pick.bonusLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pick.bonusLogoUrl}
            alt=""
            className="absolute bottom-2 right-2 h-5 w-5 object-contain drop-shadow"
          />
        )}
      </div>
    );
  }

  return (
    <div title={pickCellTitle(pick)} className={`${base} ${className}`}>
      {pick.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pick.logoUrl} alt="" className="h-5 w-5 object-contain" />
      )}
      {pick.color && (
        <span
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: pick.color }}
        />
      )}
      <span
        className="max-w-[52px] truncate text-[10px] font-semibold text-ink"
        style={
          isReadableOnDark(pick.color) ? { color: pick.color as string } : undefined
        }
      >
        {pick.shortName}
      </span>
    </div>
  );
}
