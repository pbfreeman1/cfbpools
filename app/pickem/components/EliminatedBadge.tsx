// Small "eliminated" tag for a Pick'em entry that can no longer go 6-0 —
// i.e. it already has at least one graded loss or push (pushes count as
// losses). Driven by effective_losses, which by construction only counts
// graded picks, so an in-progress or pending pick never trips this. Plain
// component, reused on both the leaderboard and the homepage entries list.
// Uses the same bg-dead/10 text-dead treatment Survivor uses for failure
// states.

export function EliminatedBadge({ effectiveLosses }: { effectiveLosses: number }) {
  if (effectiveLosses < 1) return null;
  return (
    <span className="inline-block flex-shrink-0 rounded bg-dead/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-dead">
      Eliminated
    </span>
  );
}
