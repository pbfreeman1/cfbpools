"use client";

import { useState } from "react";
import { spreadForTeam } from "@/app/pickem/components/GameCard";
import { GameMatchupLine } from "@/app/components/MatchupLine";
import { formatScheduleRow } from "@/lib/formatDate";

export type PickemGameStatus = {
  id: string;
  kickoffTime: string;
  status: string;
  effectiveSpread: number | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { id: string; name: string; logoUrl: string | null };
  awayTeam: { id: string; name: string; logoUrl: string | null };
};

function statusTag(status: string): { label: string; className: string } {
  switch (status) {
    case "in_progress":
      return { label: "Live", className: "bg-pickem-500/15 text-pickem-300" };
    case "final":
      return { label: "Final", className: "bg-edge text-muted" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-dead/10 text-dead" };
    case "postponed":
      return { label: "Postponed", className: "bg-dead/10 text-dead" };
    default:
      return { label: "Scheduled", className: "bg-edge text-muted" };
  }
}

// Public schedule info for the week — every pickem_selected game with its
// spread, kickoff, status and live score. Not picks, so no kickoff-time
// gating: all games show regardless of status.
export default function GamesPanel({ games }: { games: PickemGameStatus[] }) {
  const [open, setOpen] = useState(false);

  if (games.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-md border border-edge px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-hover"
      >
        {open ? "Hide games" : `View games (${games.length})`}
      </button>

      {open && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {games.map((g) => {
            const tag = statusTag(g.status);
            const homeSpread = spreadForTeam(g.effectiveSpread, g.homeTeam.id, g.homeTeam.id);
            const scoreKnown = g.homeScore !== null && g.awayScore !== null;
            return (
              <li
                key={g.id}
                className="flex items-center justify-between gap-2 rounded-md border border-edge bg-surface px-2.5 py-2"
              >
                <div className="min-w-0">
                  <GameMatchupLine
                    home={{
                      id: g.homeTeam.id,
                      name: g.homeTeam.name,
                      logo_url: g.homeTeam.logoUrl,
                    }}
                    away={{
                      id: g.awayTeam.id,
                      name: g.awayTeam.name,
                      logo_url: g.awayTeam.logoUrl,
                    }}
                  />
                  <p className="mt-0.5 text-[11px] text-muted">
                    {formatScheduleRow(g.kickoffTime)}
                    {homeSpread ? ` · ${g.homeTeam.name} ${homeSpread}` : ""}
                    {scoreKnown ? ` · ${g.awayScore}-${g.homeScore}` : ""}
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tag.className}`}
                >
                  {tag.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
