"use client";

import { useEffect, useState } from "react";

function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let start: number | null = null;
    let raf: number;

    function step(ts: number) {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / durationMs, 1);
      setValue(Math.round(progress * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

function Stat({
  label,
  value,
  colorClass = "text-ink",
}: {
  label: string;
  value: number;
  colorClass?: string;
}) {
  const animated = useCountUp(value);
  return (
    <div className="flex flex-1 flex-col items-center py-4">
      <span className={`font-data text-3xl font-bold ${colorClass}`}>{animated}</span>
      <span className="mt-1 text-xs uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}

export default function StatTicker({
  entries,
  alive,
  daysLeft,
}: {
  entries: number;
  alive: number;
  daysLeft: number | null;
}) {
  return (
    <div className="mb-8 flex divide-x divide-edge rounded-lg border border-edge bg-surface">
      <Stat label="Entries" value={entries} />
      <Stat label="Alive" value={alive} colorClass="text-alive" />
      {daysLeft !== null && (
        <Stat label={daysLeft === 1 ? "Day Left" : "Days Left"} value={daysLeft} colorClass="text-gold-400" />
      )}
    </div>
  );
}
