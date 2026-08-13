"use client";

import { Children, useRef, useState } from "react";

/**
 * Wraps the two pool cards in a horizontally-swipeable, scroll-snapping
 * strip on mobile with dot/arrow controls, and a plain side-by-side grid
 * on desktop (md+). The cards themselves are server-rendered and passed
 * in as children.
 */
export default function PoolCardsScroller({ children }: { children: React.ReactNode }) {
  const items = Children.toArray(children);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);

  function scrollToIndex(index: number) {
    const target = itemRefs.current[index];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    setActive(index);
  }

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    // Nearest item whose left edge the viewport has scrolled past.
    let closest = 0;
    let closestDist = Infinity;
    itemRefs.current.forEach((item, i) => {
      if (!item) return;
      const dist = Math.abs(item.offsetLeft - el.scrollLeft);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setActive(closest);
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth md:grid md:grid-cols-2 md:overflow-visible md:snap-none"
      >
        {items.map((child, i) => (
          <div
            key={i}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className="w-full flex-shrink-0 snap-center md:w-auto"
          >
            {child}
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <div className="mt-5 flex items-center justify-center gap-5 md:hidden">
          <button
            type="button"
            onClick={() => scrollToIndex(Math.max(active - 1, 0))}
            aria-label="Previous pool"
            className="rounded-full p-2 text-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="flex gap-2">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollToIndex(i)}
                aria-label={`Go to card ${i + 1}`}
                aria-current={active === i}
                className={`h-2 w-2 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-app ${
                  active === i ? "bg-gold-400" : "bg-edge"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollToIndex(Math.min(active + 1, items.length - 1))}
            aria-label="Next pool"
            className="rounded-full p-2 text-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
