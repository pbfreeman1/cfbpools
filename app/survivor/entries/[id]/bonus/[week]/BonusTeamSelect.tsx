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
  excludedBy: "Regular Pick" | "Bonus Pick" | null;
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
        <span className="truncate text-xs text-muted">Selected as your {excludedBy}</span>
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

function TeamReadOnlyCard({ team }: { team: TeamOption }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-edge bg-surface px-3 py-2.5">
      {team.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo_url} alt="" className="h-7 w-7 flex-shrink-0 object-contain" />
      )}
      <span className="text-sm font-semibold text-ink">{team.school_name}</span>
    </div>
  );
}

export default function BonusTeamSelect({
  entryId,
  scheduleId,
  weekNumber,
  teamOptions,
  existingRegularTeamId,
}: {
  entryId: string;
  scheduleId: string;
  weekNumber: number;
  teamOptions: TeamOption[];
  existingRegularTeamId: string | null;
}) {
  const [regularTeamId, setRegularTeamId] = useState(existingRegularTeamId ?? "");
  const [editingRegular, setEditingRegular] = useState(!existingRegularTeamId);
  const [bonusTeamId, setBonusTeamId] = useState("");

  const existingRegularTeam = existingRegularTeamId
    ? (teamOptions.find((t) => t.id === existingRegularTeamId) ?? null)
    : null;
  const bothSelected = Boolean(regularTeamId && bonusTeamId);
  const chosenRegular = teamOptions.find((t) => t.id === regularTeamId);
  const chosenBonus = teamOptions.find((t) => t.id === bonusTeamId);
  const regularIsChanging = existingRegularTeamId !== null && regularTeamId !== existingRegularTeamId;

  return (
    <form action={saveBonusPick} className={bothSelected ? "pb-32" : ""}>
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="weekNumber" value={weekNumber} />
      <input type="hidden" name="teamAId" value={regularTeamId} />
      <input type="hidden" name="teamBId" value={bonusTeamId} />

      <div className="mb-5 rounded-md border border-edge bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Regular Pick</p>
          <p className="text-xs text-muted">Week {weekNumber}</p>
        </div>

        {!editingRegular && existingRegularTeam ? (
          <>
            <TeamReadOnlyCard team={existingRegularTeam} />
            <button
              type="button"
              onClick={() => setEditingRegular(true)}
              className="mt-2 text-xs font-medium text-gold-400 hover:underline"
            >
              Change regular pick
            </button>
          </>
        ) : (
          <>
            {existingRegularTeamId && (
              <button
                type="button"
                onClick={() => {
                  setEditingRegular(false);
                  setRegularTeamId(existingRegularTeamId);
                }}
                className="mb-2 text-xs font-medium text-muted hover:underline"
              >
                &larr; Keep current pick
              </button>
            )}
            <div className="flex flex-col gap-2">
              {teamOptions.map((team) => (
                <TeamSlotButton
                  key={team.id}
                  team={team}
                  selected={regularTeamId === team.id}
                  excludedBy={team.id === bonusTeamId ? "Bonus Pick" : null}
                  onClick={() => setRegularTeamId(team.id === regularTeamId ? "" : team.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mb-3 rounded-md border-2 border-gold-500 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-400">Bonus Pick</p>
          <p className="text-xs text-muted">Week {weekNumber}</p>
        </div>
        <div className="flex flex-col gap-2">
          {teamOptions.map((team) => (
            <TeamSlotButton
              key={team.id}
              team={team}
              selected={bonusTeamId === team.id}
              excludedBy={team.id === regularTeamId ? "Regular Pick" : null}
              onClick={() => setBonusTeamId(team.id === bonusTeamId ? "" : team.id)}
            />
          ))}
        </div>
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
          <div className="mx-auto flex max-w-sm flex-col gap-2 sm:max-w-xl">
            {regularIsChanging ? (
              <p className="text-xs text-gold-400">
                This will update your Week {weekNumber} regular pick to {chosenRegular?.school_name}
                {existingRegularTeam ? ` (was ${existingRegularTeam.school_name})` : ""} and add{" "}
                {chosenBonus?.school_name} as your bonus pick.
              </p>
            ) : existingRegularTeamId ? (
              <p className="text-xs text-muted">
                Keeping {chosenRegular?.school_name} as your Week {weekNumber} pick, adding{" "}
                {chosenBonus?.school_name} as your bonus pick.
              </p>
            ) : (
              <p className="text-xs text-muted">
                This will set {chosenRegular?.school_name} as your Week {weekNumber} pick and add{" "}
                {chosenBonus?.school_name} as your bonus pick.
              </p>
            )}
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3 text-sm font-semibold text-ink">
                <span className="flex min-w-0 items-center gap-1.5">
                  {chosenRegular?.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={chosenRegular.logo_url}
                      alt=""
                      className="h-7 w-7 flex-shrink-0 object-contain"
                    />
                  )}
                  <span className="truncate">{chosenRegular?.school_name}</span>
                </span>
                <span className="text-muted">+</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {chosenBonus?.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={chosenBonus.logo_url}
                      alt=""
                      className="h-7 w-7 flex-shrink-0 object-contain"
                    />
                  )}
                  <span className="truncate">{chosenBonus?.school_name}</span>
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
        </div>
      )}
    </form>
  );
}
