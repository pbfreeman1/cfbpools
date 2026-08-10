"use client";

import { useState } from "react";
import { savePick } from "@/app/actions/survivor";

type TeamOption = {
  id: string;
  school_name: string;
  logo_url: string | null;
  opponent_name: string;
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
  bonusWeeksUsed,
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
  bonusWeeksUsed: number;
}) {
  const [editing, setEditing] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(currentPick?.team_id ?? "");
  const [isBonusWeek, setIsBonusWeek] = useState(currentPick?.is_bonus_week ?? false);
  const [selectedBonusTeam, setSelectedBonusTeam] = useState(currentPick?.bonus_team_id ?? "");

  const canUseBonus = bonusWeeksUsed < 2 || currentPick?.is_bonus_week;

  function TeamButton({
    team,
    selected,
    onSelect,
  }: {
    team: TeamOption;
    selected: boolean;
    onSelect: () => void;
  }) {
    return (
      <button
        type="button"
        disabled={team.disabled}
        onClick={onSelect}
        className={
          "flex flex-col gap-1 rounded-md border px-2 py-2 text-left text-sm transition " +
          (team.disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-100 opacity-60"
            : selected
              ? "border-brand-600 bg-brand-50 font-semibold text-brand-700"
              : "border-slate-300 text-slate-700 hover:bg-slate-50")
        }
      >
        <span className="flex items-center gap-2">
          {team.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo_url} alt="" className="h-5 w-5 flex-shrink-0" />
          )}
          <span className="truncate">{team.school_name}</span>
        </span>
        <span className="truncate text-xs text-slate-500">
          {team.disabled ? team.disabledReason : `vs ${team.opponent_name}`}
        </span>
      </button>
    );
  }

  // Locked, view-only state
  if (locked && !editing) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold text-slate-700">Week {weekNumber}</span>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
            Locked
          </span>
        </div>
        {currentPick ? (
          <p className="text-sm text-slate-600">
            {currentPick.team_name}
            {currentPick.is_bonus_week && currentPick.bonus_team_name
              ? ` + ${currentPick.bonus_team_name} (bonus)`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-red-600">No pick was made — missed week.</p>
        )}
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="rounded-md border border-slate-300 px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-semibold text-slate-700">Week {weekNumber}</span>
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            {currentPick ? "Change" : "Pick"}
          </button>
        </div>
        {currentPick ? (
          <p className="text-sm text-slate-600">
            {currentPick.team_name}
            {currentPick.is_bonus_week && currentPick.bonus_team_name
              ? ` + ${currentPick.bonus_team_name} (bonus)`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-slate-400">No pick yet</p>
        )}
      </div>
    );
  }

  const selectableCount = teamOptions.filter((t) => !t.disabled).length;

  return (
    <form
      action={savePick}
      className="rounded-md border-2 border-brand-500 px-4 py-3"
      onSubmit={() => setEditing(false)}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="teamId" value={selectedTeam} />
      {isBonusWeek && <input type="hidden" name="bonusTeamId" value={selectedBonusTeam} />}

      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-slate-700">Week {weekNumber}</span>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-sm text-slate-500 hover:underline"
        >
          Cancel
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {teamOptions.map((team) => (
          <TeamButton
            key={team.id}
            team={team}
            selected={selectedTeam === team.id}
            onSelect={() => setSelectedTeam(team.id)}
          />
        ))}
      </div>

      {selectableCount === 0 && (
        <p className="mb-3 text-sm text-slate-500">
          No eligible teams left for this week (already used, or all games have kicked off).
        </p>
      )}

      {canUseBonus && (
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="isBonusWeek"
            checked={isBonusWeek}
            onChange={(e) => setIsBonusWeek(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Use a bonus pick this week ({2 - bonusWeeksUsed} remaining) — both teams must win
        </label>
      )}

      {isBonusWeek && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {teamOptions
            .filter((t) => t.id !== selectedTeam)
            .map((team) => (
              <TeamButton
                key={team.id}
                team={team}
                selected={selectedBonusTeam === team.id}
                onSelect={() => setSelectedBonusTeam(team.id)}
              />
            ))}
        </div>
      )}

      <button
        type="submit"
        disabled={!selectedTeam || (isBonusWeek && !selectedBonusTeam)}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Save pick
      </button>
    </form>
  );
}
