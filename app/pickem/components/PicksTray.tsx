"use client";

import { useEffect, useRef, useState } from "react";

export type PickChip = {
  gameId: string;
  logoUrl: string | null;
  teamName: string;
  spreadLabel: string | null;
};

export function PicksTray({
  label,
  chips,
  actionLabel,
  onAction,
  actionDisabled,
  savedSignal,
}: {
  label: string;
  chips: PickChip[];
  actionLabel: string;
  onAction: () => void;
  actionDisabled: boolean;
  // Bump this (e.g. a counter incremented on every successful save) to
  // briefly flash "✓ Saved" on the action button — a number rather than a
  // boolean so two saves in a row each retrigger the flash even though the
  // "just saved" state is true both times. Omit if the parent has no save
  // confirmation to surface here (e.g. the New Entry form's create flow).
  savedSignal?: number;
}) {
  const [showSaved, setShowSaved] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return; // don't flash on initial mount
    }
    if (savedSignal === undefined) return;
    setShowSaved(true);
    const timer = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [savedSignal]);

  const displayLabel = showSaved ? "✓ Saved" : actionLabel;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-surface px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
      <div className="mx-auto max-w-sm sm:max-w-xl md:max-w-3xl">
        {chips.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 pb-1">
            {chips.map((chip) => (
              <div
                key={chip.gameId}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-edge bg-app px-2 py-1"
              >
                {chip.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={chip.logoUrl} alt="" className="h-4 w-4 flex-shrink-0 object-contain" />
                )}
                <span className="whitespace-nowrap text-xs text-ink">{chip.teamName}</span>
                {chip.spreadLabel && (
                  <span className="whitespace-nowrap font-data text-[10px] text-muted">
                    {chip.spreadLabel}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-xs text-muted">{label}</span>
          <button
            type="button"
            onClick={onAction}
            disabled={actionDisabled}
            className={`min-w-[220px] flex-shrink-0 whitespace-nowrap rounded-md px-5 py-2.5 text-center text-sm font-semibold text-app transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${
              showSaved ? "bg-alive hover:bg-alive" : "bg-pickem-500 hover:bg-pickem-600"
            }`}
          >
            {displayLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
