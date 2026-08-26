"use client";

import { formatScheduleRow } from "@/lib/formatDate";
import { isReadableOnDark } from "@/lib/color";

export type GameTeam = {
  id: string;
  name: string;
  fullName: string;
  logoUrl: string | null;
  color: string | null;
};

export type GameOption = {
  id: string;
  kickoffTime: string;
  venue: string | null;
  effectiveSpread: number | null;
  homeTeam: GameTeam;
  awayTeam: GameTeam;
};

export type GameCardBadge = { label: string; tone: "neutral" | "success" };

export type GameCardError = {
  message: string;
  actions: { label: string; onClick: () => void }[];
};

// effectiveSpread is always from the home team's perspective (negative =
// home favored). The away team's line is just the negation.
function formatSpread(spread: number): string {
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : `${spread}`;
}

export function teamSpreadLabel(game: GameOption, teamId: string): string | null {
  if (game.effectiveSpread === null) return null;
  const isHome = teamId === game.homeTeam.id;
  const raw = isHome ? game.effectiveSpread : game.effectiveSpread === 0 ? 0 : -game.effectiveSpread;
  return formatSpread(raw);
}

export function GameCard({
  game,
  now,
  selectedTeamId,
  disabled,
  onSelectTeam,
  badges,
  variant = "default",
  error,
}: {
  game: GameOption;
  now: number;
  selectedTeamId: string | undefined;
  disabled: boolean;
  onSelectTeam: (teamId: string) => void;
  badges?: GameCardBadge[];
  variant?: "default" | "saved" | "skipped" | "failed";
  error?: GameCardError;
}) {
  const isLocked = new Date(game.kickoffTime).getTime() <= now;

  const cardClass =
    variant === "failed"
      ? "border-dead"
      : variant === "saved"
        ? "border-alive/40 bg-alive/5"
        : variant === "skipped"
          ? "border-edge bg-surface-hover opacity-60"
          : "border-edge bg-surface";

  return (
    <div className={`rounded-lg border p-3 ${cardClass}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted">
        <span>
          {formatScheduleRow(game.kickoffTime)}
          {game.venue ? ` · ${game.venue}` : ""}
        </span>
        <div className="flex items-center gap-1.5">
          {isLocked && variant !== "saved" && (
            <span className="rounded bg-edge px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
              Locked
            </span>
          )}
          {badges?.map((badge) => (
            <span
              key={badge.label}
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                badge.tone === "success" ? "bg-alive/20 text-alive" : "bg-edge text-muted"
              }`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[game.awayTeam, game.homeTeam].map((team) => {
          const selected = selectedTeamId === team.id;
          const spread = teamSpreadLabel(game, team.id);
          return (
            <button
              key={team.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectTeam(team.id)}
              style={
                !disabled && team.color && isReadableOnDark(team.color)
                  ? { borderLeftColor: team.color, borderLeftWidth: "3px" }
                  : undefined
              }
              className={
                "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition " +
                (disabled
                  ? selected
                    ? "cursor-not-allowed border-pickem-500 bg-pickem-500/10 text-pickem-300 opacity-80"
                    : "cursor-not-allowed border-edge opacity-60"
                  : selected
                    ? "border-pickem-500 bg-pickem-500/10 font-semibold text-pickem-400"
                    : "border-edge text-ink hover:bg-surface-hover")
              }
            >
              {team.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={team.logoUrl} alt="" className="h-5 w-5 flex-shrink-0 object-contain" />
              )}
              <span className="min-w-0 flex-1 truncate">
                <span className="hidden sm:inline">{team.fullName}</span>
                <span className="sm:hidden">{team.name}</span>
              </span>
              {spread && (
                <span className="flex-shrink-0 font-data text-xs text-muted">{spread}</span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-2 rounded-md bg-dead/10 px-3 py-2 text-xs text-dead">
          <p className="mb-1.5">{error.message}</p>
          <div className="flex gap-3">
            {error.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className="font-semibold underline"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
