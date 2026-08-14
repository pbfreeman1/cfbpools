"use client";

import { useState } from "react";
import { saveBonusPick } from "@/app/actions/survivor-bonus";
import { OpponentLine } from "@/app/components/MatchupLine";

export type TeamOption = {
  id: string;
  school_name: string;
  logo_url: string | null;
  opponent_name: string;
  opponent_logo_url: string | null;
  prefix: "vs" | "@";
  primary_color: string | null;
  kickoff_time: string | null;
  disabled: boolean;
  disabledReason: string | null;
  ineligibleFcs: boolean;
};

function TeamSlotButton({
  team,
  selected,
  excludedBy,
  onClick,
}: {
  team: TeamOption;
  selected: boolean;
  excludedBy: "A" | "B" | null;
  onClick: () => void;
}) {
  const disabled = team.disabled || excludedBy !== null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={
        !disabled && team.primary_color
          ? { borderLeftColor: team.primary_color, borderLeftWidth: "3px" }
          : undefined
      }
      className={
        "flex flex-col gap-1 rounded-md border px-3 py-2.5 text-left text-sm transition " +
        (disabled
          ? "cursor-not-allowed border-edge bg-surface-hover opacity-60"
          : selected
            ? "border-gold-500 bg-gold-500/10 font-semibold text-gold-400"
            : "border-edge text-ink hover:bg-surface")
      }
    >
      <span className="flex items-center gap-2">
        {team.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo_url} alt="" className="h-6 w-6 flex-shrink-0 object-contain" />
        )}
        <span className="truncate">{team.school_name}</span>
        {team.ineligibleFcs && (
          <span
            title="FCS opponent — not eligible this week"
            aria-label="FCS opponent — not eligible this week"
            className="ml-auto flex-shrink-0 rounded bg-edge px-1.5 py-0.5 text-[10px] font-semibold text-muted"
          >
            🔒 FCS
          </span>
        )}
      </span>
      {excludedBy ? (
        <span className="truncate text-xs text-muted">Selected as Team {excludedBy}</span>
      ) : team.disabled && !team.ineligibleFcs ? (
        <span className="truncate text-xs text-muted">{team.disabledReason}</span>
      ) : (
        <OpponentLine
          prefix={team.prefix}
          opponent={{ name: team.opponent_name, logo_url: team.opponent_logo_url }}
        />
      )}
    </button>
  );
}

export default function BonusTeamSelect({
  entryId,
  scheduleId,
  weekNumber,
  teamOptions,
}: {
  entryId: string;
  scheduleId: string;
  weekNumber: number;
  teamOptions: TeamOption[];
}) {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");

  const bothSelected = Boolean(teamA && teamB);
  const chosenA = teamOptions.find((t) => t.id === teamA);
  const chosenB = teamOptions.find((t) => t.id === teamB);

  return (
    <form
      action={saveBonusPick}
      className={bothSelected ? "pb-24" : ""}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="weekNumber" value={weekNumber} />
      <input type="hidden" name="teamAId" value={teamA} />
      <input type="hidden" name="teamBId" value={teamB} />

      <p className="mb-2 text-xs uppercase tracking-wide text-muted">Team A</p>
      <div className="mb-4 flex flex-col gap-2">
        {teamOptions.map((team) => (
          <TeamSlotButton
            key={team.id}
            team={team}
            selected={teamA === team.id}
            excludedBy={team.id === teamB ? "B" : null}
            onClick={() => setTeamA(team.id === teamA ? "" : team.id)}
          />
        ))}
      </div>

      <p className="mb-2 text-xs uppercase tracking-wide text-muted">Team B</p>
      <div className="mb-3 flex flex-col gap-2">
        {teamOptions.map((team) => (
          <TeamSlotButton
            key={team.id}
            team={team}
            selected={teamB === team.id}
            excludedBy={team.id === teamA ? "A" : null}
            onClick={() => setTeamB(team.id === teamB ? "" : team.id)}
          />
        ))}
      </div>

      <p className="mb-3 text-xs text-muted">Both teams must win for this entry to advance.</p>

      {!bothSelected && (
        <button
          type="submit"
          disabled
          className="w-full rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          Confirm Pick
        </button>
      )}

      {bothSelected && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-surface px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
          <div className="mx-auto flex max-w-sm items-center gap-3 sm:max-w-xl">
            <div className="flex min-w-0 flex-1 items-center gap-3 text-sm font-semibold text-ink">
              <span className="flex min-w-0 items-center gap-1.5">
                {chosenA?.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={chosenA.logo_url} alt="" className="h-7 w-7 flex-shrink-0 object-contain" />
                )}
                <span className="truncate">{chosenA?.school_name}</span>
              </span>
              <span className="text-muted">+</span>
              <span className="flex min-w-0 items-center gap-1.5">
                {chosenB?.logo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={chosenB.logo_url} alt="" className="h-7 w-7 flex-shrink-0 object-contain" />
                )}
                <span className="truncate">{chosenB?.school_name}</span>
              </span>
            </div>
            <button
              type="submit"
              className="flex-shrink-0 rounded-md bg-gold-500 px-5 py-2.5 text-sm font-semibold text-app transition hover:bg-gold-600"
            >
              Confirm Pick
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
