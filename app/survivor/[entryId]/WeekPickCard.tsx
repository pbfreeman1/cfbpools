"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { savePick } from "@/app/actions/survivor";

type TeamOption = {
  id: string;
  school_name: string;
  logo_url: string | null;
  opponent_name: string;
  primary_color: string | null;
  disabled: boolean;
  disabledReason: string | null;
};

export default function WeekPickCard({
  entryId,
  scheduleId,
  weekNumber,
  locked,
  currentPick,
  teamOptions,
  autoOpen,
}: {
  entryId: string;
  scheduleId: string;
  weekNumber: number;
  locked: boolean;
  currentPick: {
    team_id: string;
    team_name: string;
    is_bonus_week: boolean;
    bonus_team_id: string | null;
    bonus_team_name: string | null;
  } | null;
  teamOptions: TeamOption[];
  autoOpen?: boolean;
}) {
  const [editing, setEditing] = useState(Boolean(autoOpen) && !locked && !currentPick?.is_bonus_week);
  const [selectedTeam, setSelectedTeam] = useState(currentPick?.team_id ?? "");

  useEffect(() => {
    if (autoOpen) {
      document.getElementById(`week-${weekNumber}`)?.scrollIntoView({ block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function TeamButton({ team }: { team: TeamOption }) {
    const selected = selectedTeam === team.id;
    return (
      <button
        type="button"
        disabled={team.disabled}
        onClick={() => setSelectedTeam(team.id)}
        style={
          !team.disabled && team.primary_color
            ? { borderLeftColor: team.primary_color, borderLeftWidth: "3px" }
            : undefined
        }
        className={
          "flex flex-col gap-1 rounded-md border px-2 py-2 text-left text-sm transition " +
          (team.disabled
            ? "cursor-not-allowed border-edge bg-surface-hover opacity-60"
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
        </span>
        <span className="truncate text-xs text-muted">
          {team.disabled ? team.disabledReason : `vs ${team.opponent_name}`}
        </span>
      </button>
    );
  }

  // A bonus week is always managed on the dedicated Bonus Picks page — this
  // card just shows what was chosen, read-only, with a link over there.
  if (currentPick?.is_bonus_week) {
    return (
      <div
        id={`week-${weekNumber}`}
        className="rounded-md border border-gold-500 bg-gold-500/5 px-4 py-3"
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold text-ink">Week {weekNumber}</span>
          <span className="rounded-full bg-gold-500/20 px-2 py-0.5 text-xs font-medium text-gold-400">
            Bonus week
          </span>
        </div>
        <p className="mb-1 text-sm text-muted">
          {currentPick.team_name} + {currentPick.bonus_team_name}
        </p>
        {!locked && (
          <Link
            href={`/survivor/${entryId}/bonus`}
            className="text-sm font-medium text-gold-400 hover:underline"
          >
            Manage on Bonus Picks page &rarr;
          </Link>
        )}
      </div>
    );
  }

  // Locked, view-only state
  if (locked && !editing) {
    return (
      <div id={`week-${weekNumber}`} className="rounded-md border border-edge bg-surface px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold text-ink">Week {weekNumber}</span>
          <span className="rounded-full bg-edge px-2 py-0.5 text-xs font-medium text-muted">
            Locked
          </span>
        </div>
        {currentPick ? (
          <p className="text-sm text-muted">{currentPick.team_name}</p>
        ) : (
          <p className="text-sm text-dead">No pick was made — missed week.</p>
        )}
      </div>
    );
  }

  if (!editing) {
    return (
      <div id={`week-${weekNumber}`} className="rounded-md border border-edge px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold text-ink">Week {weekNumber}</span>
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-gold-400 hover:underline"
          >
            {currentPick ? "Change" : "Pick"}
          </button>
        </div>
        {currentPick ? (
          <p className="text-sm text-muted">{currentPick.team_name}</p>
        ) : (
          <p className="text-sm text-muted">No pick yet</p>
        )}
      </div>
    );
  }

  const selectableCount = teamOptions.filter((t) => !t.disabled).length;

  return (
    <form
      id={`week-${weekNumber}`}
      action={savePick}
      className="rounded-md border-2 border-gold-500 px-4 py-3"
      onSubmit={() => setEditing(false)}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="teamId" value={selectedTeam} />

      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-ink">Week {weekNumber}</span>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-sm text-muted hover:underline"
        >
          Cancel
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {teamOptions.map((team) => (
          <TeamButton key={team.id} team={team} />
        ))}
      </div>

      {selectableCount === 0 && (
        <p className="mb-3 text-sm text-muted">
          No eligible teams left for this week (already used, or all games have kicked off).
        </p>
      )}

      <button
        type="submit"
        disabled={!selectedTeam}
        className="w-full rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Save pick
      </button>
    </form>
  );
}
