"use client";

import { savePick } from "@/app/actions/survivor";

export default function RemoveBonusButton({
  entryId,
  scheduleId,
  keepTeamId,
}: {
  entryId: string;
  scheduleId: string;
  /** The original team_id, kept as a normal (non-bonus) pick after removal. */
  keepTeamId: string;
}) {
  return (
    <form action={savePick}>
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="teamId" value={keepTeamId} />
      {/* isBonusWeek intentionally omitted — false clears the bonus flag */}
      <button
        type="submit"
        className="text-xs font-medium text-dead hover:underline"
      >
        Remove bonus
      </button>
    </form>
  );
}
