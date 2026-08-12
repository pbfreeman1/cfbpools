"use client";

import { useEffect, useState } from "react";

function getTimeParts(target: Date) {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds };
}

export default function CountdownTimer({
  target,
  label,
}: {
  target: string; // ISO datetime
  label: string;
}) {
  const targetDate = new Date(target);
  const [parts, setParts] = useState(() => getTimeParts(targetDate));

  useEffect(() => {
    const id = setInterval(() => setParts(getTimeParts(targetDate)), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!parts) {
    return (
      <div className="rounded-md border border-edge bg-surface px-4 py-3 text-center">
        <p className="font-display text-sm uppercase tracking-wide text-dead">{label} started</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-edge bg-surface px-4 py-3 text-center">
      <p className="mb-1 font-display text-xs uppercase tracking-wide text-muted">{label}</p>
      <div className="flex justify-center gap-3 font-data text-2xl font-bold text-gold-400">
        {parts.days > 0 && (
          <span>
            {parts.days}
            <span className="text-xs text-muted">d</span>
          </span>
        )}
        <span>
          {String(parts.hours).padStart(2, "0")}
          <span className="text-xs text-muted">h</span>
        </span>
        <span>
          {String(parts.minutes).padStart(2, "0")}
          <span className="text-xs text-muted">m</span>
        </span>
        <span>
          {String(parts.seconds).padStart(2, "0")}
          <span className="text-xs text-muted">s</span>
        </span>
      </div>
    </div>
  );
}
