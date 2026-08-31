// Shows an entry's confirmed record and, only while a game is actually in
// progress, a visually distinct live/unofficial projection beside it. Plain
// (non-"use client") component so it renders from both the server homepage
// and the client leaderboard table.
//
// Final record is authoritative (from pickem_entry_records). The live line
// is display-only math (get_pickem_leaderboard's live_wins/live_losses) and
// is deliberately styled softer + tagged so it can never be mistaken for
// the confirmed record.

export function EntryRecordBadges({
  wins,
  effectiveLosses,
  liveWins,
  liveLosses,
  align = "right",
}: {
  wins: number;
  effectiveLosses: number;
  liveWins: number;
  liveLosses: number;
  align?: "right" | "left";
}) {
  const hasLiveDelta = liveWins !== wins || liveLosses !== effectiveLosses;

  return (
    <div className={`flex-shrink-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <p className="font-data text-sm font-semibold text-ink">
        {wins}-{effectiveLosses}
      </p>
      {hasLiveDelta && (
        <p
          className={`mt-0.5 flex items-center gap-1 text-[11px] font-normal text-muted ${
            align === "right" ? "justify-end" : "justify-start"
          }`}
        >
          <span className="rounded bg-pickem-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-pickem-300">
            Live
          </span>
          <span className="font-data italic">
            {liveWins}-{liveLosses}
          </span>
          <span className="italic">unofficial</span>
        </p>
      )}
    </div>
  );
}
