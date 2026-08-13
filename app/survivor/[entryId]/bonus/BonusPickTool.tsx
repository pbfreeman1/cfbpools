"use client";

import { useState } from "react";
import Link from "next/link";
import { savePick } from "@/app/actions/survivor";
import { OpponentLine } from "@/app/components/MatchupLine";
import WeekSelectorStrip from "@/app/components/WeekSelectorStrip";
import RemoveBonusButton from "./RemoveBonusButton";

type TeamOption = {
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

export type BonusWeekData = {
  weekNumber: number;
  scheduleId: string;
  locked: boolean;
  /** Unlocked, and either already a bonus week or the entry has a bonus slot left. */
  canOfferBonus: boolean;
  currentPick: {
    team_id: string;
    team_name: string;
    team_logo: string | null;
    is_bonus_week: boolean;
    bonus_team_id: string | null;
    bonus_team_name: string | null;
    bonus_team_logo: string | null;
  } | null;
  teamOptions: TeamOption[];
};

function TeamSlotButton({
  team,
  selected,
  excludedBy,
  onClick,
}: {
  team: TeamOption;
  selected: boolean;
  /** "A" or "B" if taken by the other slot — distinct from a server-disabled reason. */
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
        <OpponentLine prefix={team.prefix} opponent={{ name: team.opponent_name, logo_url: team.opponent_logo_url }} />
      )}
    </button>
  );
}

function BonusForm({
  entryId,
  week,
}: {
  entryId: string;
  week: BonusWeekData;
}) {
  const [teamA, setTeamA] = useState(week.currentPick?.team_id ?? "");
  const [teamB, setTeamB] = useState(week.currentPick?.is_bonus_week ? week.currentPick.bonus_team_id ?? "" : "");

  return (
    <form action={savePick} className="rounded-md border-2 border-gold-500 px-4 py-3">
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="scheduleId" value={week.scheduleId} />
      <input type="hidden" name="teamId" value={teamA} />
      <input type="hidden" name="bonusTeamId" value={teamB} />
      <input type="hidden" name="isBonusWeek" value="on" />

      <div className="mb-3 flex items-center justify-between">
        <span className="font-semibold text-ink">Week {week.weekNumber} &mdash; bonus pick</span>
      </div>

      {week.currentPick && !week.currentPick.is_bonus_week && (
        <p className="mb-3 text-xs text-muted">
          Upgrading your existing pick ({week.currentPick.team_name}) to a bonus pick.
        </p>
      )}

      <p className="mb-2 text-xs uppercase tracking-wide text-muted">Team A</p>
      <div className="mb-4 flex flex-col gap-2">
        {week.teamOptions.map((team) => (
          <TeamSlotButton
            key={team.id}
            team={team}
            selected={teamA === team.id}
            excludedBy={team.id === teamB ? "B" : null}
            onClick={() => setTeamA(team.id)}
          />
        ))}
      </div>

      <p className="mb-2 text-xs uppercase tracking-wide text-muted">Team B</p>
      <div className="mb-3 flex flex-col gap-2">
        {week.teamOptions.map((team) => (
          <TeamSlotButton
            key={team.id}
            team={team}
            selected={teamB === team.id}
            excludedBy={team.id === teamA ? "A" : null}
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

export default function BonusPickTool({
  entryId,
  weeksData,
  initialWeekNumber,
  eliminated,
  bonusWeeksUsed,
}: {
  entryId: string;
  weeksData: BonusWeekData[];
  initialWeekNumber: number;
  eliminated: boolean;
  bonusWeeksUsed: number;
}) {
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(initialWeekNumber);
  const week = weeksData.find((w) => w.weekNumber === selectedWeekNumber) ?? weeksData[0];

  function selectWeek(weekNumber: number) {
    setSelectedWeekNumber(weekNumber);
    const url = new URL(window.location.href);
    url.searchParams.set("week", String(weekNumber));
    window.history.replaceState(null, "", url);
  }

  if (!week) {
    return <p className="text-sm text-muted">Season schedule not yet loaded.</p>;
  }

  return (
    <div>
      <WeekSelectorStrip
        weeks={weeksData.map((w) => ({
          weekNumber: w.weekNumber,
          locked: w.locked,
          hasPick: Boolean(w.currentPick),
          isBonusWeek: w.currentPick?.is_bonus_week ?? false,
        }))}
        selectedWeekNumber={week.weekNumber}
        onSelect={selectWeek}
      />

      {week.locked ? (
        <div className="rounded-md border border-edge bg-surface px-4 py-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-ink">Week {week.weekNumber}</span>
            <span className="rounded-full bg-edge px-2 py-0.5 text-xs font-medium text-muted">
              {eliminated ? "Eliminated" : "Locked"}
            </span>
          </div>
          {week.currentPick ? (
            week.currentPick.is_bonus_week ? (
              <div className="flex items-center gap-4 text-sm text-ink">
                <span className="flex items-center gap-1.5">
                  {week.currentPick.team_logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={week.currentPick.team_logo} alt="" className="h-5 w-5 object-contain" />
                  )}
                  {week.currentPick.team_name}
                </span>
                <span className="text-muted">+</span>
                <span className="flex items-center gap-1.5">
                  {week.currentPick.bonus_team_logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={week.currentPick.bonus_team_logo} alt="" className="h-5 w-5 object-contain" />
                  )}
                  {week.currentPick.bonus_team_name}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted">{week.currentPick.team_name}</p>
            )
          ) : (
            <p className="text-sm text-dead">
              {eliminated ? "No picks possible — entry eliminated." : "No pick was made — missed week."}
            </p>
          )}
        </div>
      ) : week.currentPick?.is_bonus_week ? (
        <div className="rounded-md border border-gold-500 bg-gold-500/5 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-ink">Week {week.weekNumber}</span>
            <span className="rounded-full bg-gold-500/20 px-2 py-0.5 text-xs font-medium text-gold-400">
              Bonus week
            </span>
          </div>
          <div className="mb-3 flex items-center gap-4 text-sm text-ink">
            <span className="flex items-center gap-1.5">
              {week.currentPick.team_logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={week.currentPick.team_logo} alt="" className="h-5 w-5 object-contain" />
              )}
              {week.currentPick.team_name}
            </span>
            <span className="text-muted">+</span>
            <span className="flex items-center gap-1.5">
              {week.currentPick.bonus_team_logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={week.currentPick.bonus_team_logo} alt="" className="h-5 w-5 object-contain" />
              )}
              {week.currentPick.bonus_team_name}
            </span>
          </div>
          {!eliminated && (
            <RemoveBonusButton
              entryId={entryId}
              scheduleId={week.scheduleId}
              keepTeamId={week.currentPick.team_id}
            />
          )}
        </div>
      ) : week.canOfferBonus ? (
        week.teamOptions.some((t) => !t.disabled) ? (
          <BonusForm key={week.scheduleId} entryId={entryId} week={week} />
        ) : (
          <div className="rounded-md border border-edge bg-surface px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold text-ink">Week {week.weekNumber}</span>
            </div>
            <p className="text-sm text-muted">
              No eligible teams left for this week (already used, or all games have kicked off).
            </p>
          </div>
        )
      ) : (
        <div className="rounded-md border border-edge bg-surface px-4 py-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-ink">Week {week.weekNumber}</span>
          </div>
          <p className="mb-2 text-sm text-muted">
            {bonusWeeksUsed >= 2
              ? "You've already used both bonus picks this season."
              : "This week can't take a bonus pick."}
          </p>
          {week.currentPick && (
            <p className="mb-2 text-sm text-ink">Current pick: {week.currentPick.team_name}</p>
          )}
          <Link
            href={`/survivor/${entryId}?week=${week.weekNumber}`}
            className="text-sm font-medium text-gold-400 hover:underline"
          >
            Manage on main Pick Tool &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
