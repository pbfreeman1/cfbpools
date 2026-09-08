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
// anchor) — instead, when the entry is still editable, a stretched-link
// overlay (absolute inset-0, z-0) makes the whole card tap to the edit
// page, while the interactive footer (Show/Hide picks, Retry inside
// ExpandablePicks) sits above it at z-10. `editable` is false once every
// game in the week's pool has kicked off — then there's no overlay and the
// footer says "Picks locked" instead of implying an edit is possible.
export default function OwnEntryCard({
  entryId,
  entryName,
  createdAt,
  picksMade,
  record,
  editable,
}: {
  entryId: string;
  entryName: string;
  createdAt: string;
  picksMade: number;
  record: OwnEntryRecord | null;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const editHref = `/pickem/entries/${entryId}/edit`;

  return (
    <div
      className={`relative rounded-lg border bg-surface px-4 py-3 ${
        editable
          ? "border-edge transition hover:border-pickem-500/60 hover:bg-surface-hover"
          : "border-edge"
      }`}
    >
      {editable && (
        <Link
          href={editHref}
          aria-label={`Edit picks for ${entryName}`}
          className="absolute inset-0 z-0 rounded-lg"
        />
      )}

      <div className="pointer-events-none relative z-10 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {editable ? (
            <p className="truncate text-sm font-medium text-ink">{entryName}</p>
          ) : (
            <Link
              href={editHref}
              className="pointer-events-auto truncate text-sm font-medium text-ink hover:text-pickem-400 hover:underline"
            >
              {entryName}
            </Link>
          )}
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

      <div className="pointer-events-none relative z-10 mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="pointer-events-auto text-xs font-medium text-pickem-400 hover:underline"
        >
          {open ? "Hide picks" : "Show picks"}
        </button>
        {editable ? (
          <span className="text-xs font-semibold text-pickem-400">Tap to edit picks &rarr;</span>
        ) : (
          <span className="text-xs font-medium text-muted">Picks locked</span>
        )}
      </div>

      <div className="relative z-10">
        <ExpandablePicks entryId={entryId} open={open} isOwn />
      </div>
    </div>
  );
}
