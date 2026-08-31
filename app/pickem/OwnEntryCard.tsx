"use client";

import { useState } from "react";
import Link from "next/link";
import { formatKickoff } from "@/lib/formatDate";
import { EntryRecordBadges } from "./components/EntryRecordBadges";
import { EliminatedBadge } from "./components/EliminatedBadge";
import { ExpandablePicks } from "./components/ExpandablePicks";

export type OwnEntryRecord = {
  wins: number;
  effectiveLosses: number;
  liveWins: number;
  liveLosses: number;
};

// One row in the homepage "Your entries" list. The card is no longer a
// single big <Link> (a nested expand button would be invalid inside an
// anchor) — the entry name links to the edit page, and a separate toggle
// reveals the same ExpandablePicks / record components the leaderboard uses.
export default function OwnEntryCard({
  entryId,
  entryName,
  createdAt,
  picksMade,
  record,
}: {
  entryId: string;
  entryName: string;
  createdAt: string;
  picksMade: number;
  record: OwnEntryRecord | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-edge bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/pickem/entries/${entryId}/edit`}
            className="truncate text-sm font-medium text-ink hover:text-pickem-400 hover:underline"
          >
            {entryName}
          </Link>
          <p className="text-xs text-muted">Entered {formatKickoff(createdAt)}</p>
          {record && (
            <div className="mt-1">
              <EliminatedBadge effectiveLosses={record.effectiveLosses} />
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          {record ? (
            <EntryRecordBadges
              wins={record.wins}
              effectiveLosses={record.effectiveLosses}
              liveWins={record.liveWins}
              liveLosses={record.liveLosses}
            />
          ) : (
            <span className="font-data text-sm font-semibold text-pickem-400">
              {picksMade}/6
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 text-xs font-medium text-pickem-400 hover:underline"
      >
        {open ? "Hide picks" : "Show picks"}
      </button>

      <ExpandablePicks entryId={entryId} open={open} isOwn />
    </div>
  );
}
