"use client";

import { useState } from "react";
import { savePick } from "@/app/actions/survivor";
import { OpponentLine } from "@/app/components/MatchupLine";

type TeamOption = {
  id: string;
  school_name: string;
  logo_url: string | null;
  opponent_name: string;
  opponent_logo_url: string | null;
  prefix: "vs" | "@";
  disabled: boolean;
  ineligibleFcs: boolean;
};

export default function BonusPickEditor({
  entryId,
  scheduleId,
  weekNumber,
  teamOptions,
  defaultTeamId,
}: {
  entryId: string;
  scheduleId: string;
  weekNumber: number;
  teamOptions: TeamOption[];
  /** Pre-select this team as "Team A" if the week already has a pick. */
  defaultTeamId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [teamA, setTeamA] = useState(defaultTeamId ?? "");
  const [teamB, setTeamB] = useState("");

  function TeamGridButton({
    team,
    selected,
    excluded,
    onClick,
  }: {
    team: TeamOption;
    selected: boolean;
    /** Taken by the other slot (Team A/B) — a different reason than FCS-ineligible. */
    excluded: boolean;
    onClick: () => void;
  }) {
    const disabled = excluded || team.disabled;
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={
          "flex flex-col gap-1 rounded-md border px-2 py-2 text-left text-sm transition " +
          (disabled
            ? "cursor-not-allowed border-edge bg-surface-hover opacity-40"
            : selected
              ? "border-gold-500 bg-gold-500/10 font-semibold text-gold-400"
              : "border-edge text-ink hover:bg-surface")
        }
      >
        <span className="flex items-center gap-2">
          {team.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo_url} alt="" className="h-5 w-5 flex-shrink-0 object-contain" />
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
        <OpponentLine prefix={team.prefix} opponent={{ name: team.opponent_name, logo_url: team.opponent_logo_url }} />
      </button>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-md border border-dashed border-edge px-4 py-3 text-left text-sm text-muted transition hover:border-gold-500 hover:text-ink"
      >
        <span>Week {weekNumber}</span>
        <span className="text-gold-400">Make this a bonus week &rarr;</span>
      </button>
    );
  }

  return (
    <form
      action={savePick}
      className="rounded-md border-2 border-gold-500 px-4 py-3"
      onSubmit={() => setOpen(false)}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="teamId" value={teamA} />
      <input type="hidden" name="bonusTeamId" value={teamB} />
      <input type="hidden" name="isBonusWeek" value="on" />

      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-ink">Week {weekNumber} &mdash; bonus pick</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted hover:underline"
        >
          Cancel
        </button>
      </div>

      <p className="mb-2 text-xs uppercase tracking-wide text-muted">Team A</p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {teamOptions.map((team) => (
          <TeamGridButton
            key={team.id}
            team={team}
            selected={teamA === team.id}
            excluded={team.id === teamB}
            onClick={() => setTeamA(team.id)}
          />
        ))}
      </div>

      <p className="mb-2 text-xs uppercase tracking-wide text-muted">Team B</p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {teamOptions.map((team) => (
          <TeamGridButton
            key={team.id}
            team={team}
            selected={teamB === team.id}
            excluded={team.id === teamA}
            onClick={() => setTeamB(team.id)}
          />
        ))}
      </div>

      <p className="mb-3 text-xs text-muted">Both teams must win for this entry to advance.</p>

      <button
        type="submit"
        disabled={!teamA || !teamB}
        className="w-full rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Confirm bonus pick
      </button>
    </form>
  );
}
