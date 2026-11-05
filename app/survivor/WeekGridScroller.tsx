"use client";

import { useLayoutEffect, useRef } from "react";

// Horizontal scroller for an entry's week grid. On mount it scrolls so the
// element marked `data-scroll-anchor` (the previous week's header/cell) is the
// first visible column — earlier weeks sit off-screen to the left, future
// weeks to the right. useLayoutEffect so there's no visible jump on load.
export default function WeekGridScroller({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const anchor = el.querySelector<HTMLElement>("[data-scroll-anchor]");
    if (!anchor) return;
    el.scrollLeft =
      anchor.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
