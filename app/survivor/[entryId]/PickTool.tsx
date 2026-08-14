"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { savePick } from "@/app/actions/survivor";
import { OpponentLine } from "@/app/components/MatchupLine";
import WeekSelectorStrip from "@/app/components/WeekSelectorStrip";

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

export type WeekData = {
  weekNumber: number;
  scheduleId: string;
  startDate: string;
  endDate: string;
  locked: boolean;
  currentPick: {
    team_id: string;
    team_name: string;
    is_bonus_week: boolean;
    bonus_team_id: string | null;
    bonus_team_name: string | null;
  } | null;
  teamOptions: TeamOption[];
};

function TeamOptionButton({
  team,
  selected,
  onClick,
}: {
  team: TeamOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={team.disabled}
      onClick={onClick}
      style={
        !team.disabled && team.primary_color
          ? { borderLeftColor: team.primary_color, borderLeftWidth: "3px" }
          : undefined
      }
      className={
        "flex flex-col gap-1 rounded-md border px-3 py-2.5 text-left text-sm transition " +
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
      {team.disabled && !team.ineligibleFcs ? (
        <span className="truncate text-xs text-muted">{team.disabledReason}</span>
      ) : (
        <OpponentLine prefix={team.prefix} opponent={{ name: team.opponent_name, logo_url: team.opponent_logo_url }} />
      )}
    </button>
  );
}

export default function PickTool({
  entryId,
  weeksData,
  initialWeekNumber,
  eliminated,
}: {
  entryId: string;
  weeksData: WeekData[];
  initialWeekNumber: number;
  eliminated: boolean;
}) {
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(initialWeekNumber);
  const week = weeksData.find((w) => w.weekNumber === selectedWeekNumber) ?? weeksData[0];
  const [selectedTeam, setSelectedTeam] = useState(week?.currentPick?.team_id ?? "");

  useEffect(() => {
    setSelectedTeam(week?.currentPick?.team_id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeekNumber]);

  // Switching weeks is a pure client-state change — the URL is kept in
  // sync (for deep-linking/reload) via history.replaceState, not the
  // router, so it never triggers a server round-trip.
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

      {week.currentPick?.is_bonus_week ? (
        <div className="rounded-md border border-gold-500 bg-gold-500/5 px-4 py-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-ink">Week {week.weekNumber}</span>
            <span className="rounded-full bg-gold-500/20 px-2 py-0.5 text-xs font-medium text-gold-400">
              Bonus week
            </span>
          </div>
          <p className="mb-1 text-sm text-muted">
            {week.currentPick.team_name} + {week.currentPick.bonus_team_name}
          </p>
          {!week.locked && !eliminated && (
            <Link
              href={`/survivor/entries/${entryId}/bonus`}
              className="text-sm font-medium text-gold-400 hover:underline"
            >
              Manage on Bonus Picks page &rarr;
            </Link>
          )}
        </div>
      ) : week.locked ? (
        <div className="rounded-md border border-edge bg-surface px-4 py-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-ink">Week {week.weekNumber}</span>
            <span className="rounded-full bg-edge px-2 py-0.5 text-xs font-medium text-muted">
              {eliminated ? "Eliminated" : "Locked"}
            </span>
          </div>
          {week.currentPick ? (
            <p className="text-sm text-muted">{week.currentPick.team_name}</p>
          ) : (
            <p className="text-sm text-dead">
              {eliminated ? "No picks possible — entry eliminated." : "No pick was made — missed week."}
            </p>
          )}
        </div>
      ) : (
        <form
          action={savePick}
          className={
            "rounded-md border-2 border-gold-500 px-4 py-3" + (selectedTeam ? " pb-24" : "")
          }
        >
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="scheduleId" value={week.scheduleId} />
          <input type="hidden" name="teamId" value={selectedTeam} />

          <div className="mb-3 flex items-center justify-between">
            <span className="font-semibold text-ink">Week {week.weekNumber}</span>
          </div>

          {week.teamOptions.length === 0 ? (
            <p className="mb-3 text-sm text-muted">No SEC games scheduled this week.</p>
          ) : (
            <div className="mb-3 flex flex-col gap-2">
              {week.teamOptions.map((team) => (
                <TeamOptionButton
                  key={team.id}
                  team={team}
                  selected={selectedTeam === team.id}
                  onClick={() => setSelectedTeam(team.id === selectedTeam ? "" : team.id)}
                />
              ))}
            </div>
          )}

          {week.teamOptions.length > 0 && week.teamOptions.every((t) => t.disabled) && (
            <p className="mb-3 text-sm text-muted">
              No eligible teams left for this week (already used, or all games have kicked off).
            </p>
          )}

          {!selectedTeam && (
            <button
              type="submit"
              disabled
              className="w-full rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save pick
            </button>
          )}

          {selectedTeam &&
            (() => {
              const chosen = week.teamOptions.find((t) => t.id === selectedTeam);
              return (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-surface px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
                  <div className="mx-auto flex max-w-sm items-center gap-3 sm:max-w-xl md:max-w-3xl lg:max-w-5xl">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {chosen?.logo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={chosen.logo_url}
                          alt=""
                          className="h-8 w-8 flex-shrink-0 object-contain"
                        />
                      )}
                      <span className="truncate text-sm font-semibold text-ink">
                        {chosen?.school_name}
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
              );
            })()}
        </form>
      )}
    </div>
  );
}
