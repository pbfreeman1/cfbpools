import { isReadableOnDark } from "@/lib/color";

export type MatchupTeamRef = {
  id: string;
  name: string;
  logo_url: string | null;
  color?: string | null;
};

/**
 * "vs" for the home team, "@" for the away team — the one home/away rule
 * every matchup display in the app should derive from, rather than each
 * page re-deciding it. There's no neutral-site flag in `games`, so a
 * neutral-site game reads as "vs" (same as home) since it isn't marked away.
 */
export function getMatchupPrefix(teamId: string, homeTeamId: string): "vs" | "@" {
  return teamId === homeTeamId ? "vs" : "@";
}

/**
 * A single team's opponent this week, from that team's own perspective —
 * "vs [logo] Opponent" or "@ [logo] Opponent". Logo sits beside the
 * opponent's name, after the prefix, not before it.
 */
export function OpponentLine({
  prefix,
  opponent,
  className,
}: {
  prefix: "vs" | "@";
  opponent: Pick<MatchupTeamRef, "name" | "logo_url">;
  className?: string;
}) {
  return (
    <span className={className ?? "flex items-center gap-1 truncate text-xs text-muted"}>
      <span className="flex-shrink-0">{prefix}</span>
      {opponent.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={opponent.logo_url} alt="" className="h-3.5 w-3.5 flex-shrink-0 object-contain" />
      )}
      <span className="truncate">{opponent.name}</span>
    </span>
  );
}

function TeamNameChip({ team, bold }: { team: MatchupTeamRef; bold?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {team.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo_url} alt="" className="h-5 w-5 flex-shrink-0 object-contain" />
      )}
      <span
        className={`text-sm ${bold ? "font-semibold" : "font-medium"} text-ink`}
        style={isReadableOnDark(team.color) ? { color: team.color as string } : undefined}
      >
        {team.name}
      </span>
    </span>
  );
}

/**
 * A full game, shown from neither side — "[away] @ [home]", the standard
 * schedule convention. Shares the same home/away derivation as OpponentLine
 * so every matchup in the app reads the same way.
 */
export function GameMatchupLine({
  home,
  away,
  homeWon,
  awayWon,
}: {
  home: MatchupTeamRef;
  away: MatchupTeamRef;
  homeWon?: boolean;
  awayWon?: boolean;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <TeamNameChip team={away} bold={awayWon} />
      <span className="text-xs text-muted">@</span>
      <TeamNameChip team={home} bold={homeWon} />
    </span>
  );
}
