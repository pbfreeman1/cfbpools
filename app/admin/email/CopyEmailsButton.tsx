"use client";

import { useState, useTransition } from "react";

export default function CopyEmailsButton({
  label,
  action,
}: {
  label: string;
  action: () => Promise<string[]>;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function handleClick() {
    setNote(null);
    startTransition(async () => {
      try {
        const emails = await action();
        if (emails.length === 0) {
          setNote("No addresses");
          return;
        }
        await navigator.clipboard.writeText(emails.join(", "));
        setNote(`Copied ${emails.length} address${emails.length === 1 ? "" : "es"}`);
      } catch {
        setNote("Copy failed");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-md border border-edge px-3 py-1.5 text-left text-sm font-medium text-ink transition hover:bg-surface-hover disabled:opacity-50"
    >
      {label}
      {note && <span className="ml-2 text-xs text-alive">{note}</span>}
      {pending && <span className="ml-2 text-xs text-muted">…</span>}
    </button>
  );
}
