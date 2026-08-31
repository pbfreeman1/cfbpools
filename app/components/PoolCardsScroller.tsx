/**
 * Lays out the two pool cards: stacked full-width on mobile, side-by-side
 * grid on desktop (md+). The cards themselves are server-rendered and
 * passed in as children.
 */
export default function PoolCardsScroller({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 md:grid md:grid-cols-2">{children}</div>;
}
