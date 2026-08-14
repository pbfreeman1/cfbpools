"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Fires once after createEntry() redirects to /survivor?entry_created=1.
 * Dismissing clears the query param via router.replace so a refresh
 * doesn't re-trigger it — no server round-trip needed for that swap.
 */
export default function EntryCreatedModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  const entryName = searchParams.get("entry_name");

  useEffect(() => {
    if (searchParams.get("entry_created") === "1") {
      setOpen(true);
      // Mount in the "before" state first, then flip on the next frame so
      // the transition classes actually animate instead of snapping in.
      requestAnimationFrame(() => setVisible(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    setVisible(false);
    setTimeout(() => {
      setOpen(false);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("entry_created");
      params.delete("entry_name");
      const query = params.toString();
      router.replace(query ? `/survivor?${query}` : "/survivor");
    }, 200);
  }

  if (!open) return null;

  return (
    <div
      className={
        "fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 transition-opacity duration-200 " +
        (visible ? "opacity-100" : "opacity-0")
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-created-title"
    >
      <div
        className={
          "w-full max-w-sm rounded-lg border border-edge bg-surface p-6 shadow-xl transition-all duration-200 " +
          (visible ? "scale-100 opacity-100" : "scale-95 opacity-0")
        }
      >
        <h2
          id="entry-created-title"
          className="mb-2 font-display text-xl font-bold uppercase tracking-wide text-gold-400"
        >
          You&apos;re in!
        </h2>
        <p className="mb-4 text-sm text-ink">
          {entryName ? (
            <>
              <strong>{entryName}</strong> is entered in this year&apos;s SEC Survivor Pool.
            </>
          ) : (
            "Your entry is set up in this year's SEC Survivor Pool."
          )}
        </p>
        <div className="mb-4 rounded-md border border-gold-500/40 bg-gold-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-gold-400">Next: pay your $30 entry fee</p>
          <p className="mt-1 text-sm text-ink">
            Venmo <strong>@brentfreeman1</strong> for $30 to lock in your spot.
          </p>
        </div>
        <p className="mb-5 text-xs text-muted">
          Make your Week 1 pick before kickoff — picks lock the moment that game starts.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="w-full rounded-md bg-gold-500 px-4 py-2.5 text-center text-sm font-semibold text-app transition hover:bg-gold-600"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
