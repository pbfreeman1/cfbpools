"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendWeeklyEmailsNow } from "@/app/actions/admin-email";

export default function SendNowButton({
  jobType,
  label,
  variant = "secondary",
}: {
  jobType?: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function handleClick() {
    if (
      !confirm(
        `Send now: ${label}\n\nThis sends real emails via Resend to live recipients. Continue?`
      )
    ) {
      return;
    }
    setNote(null);
    startTransition(async () => {
      try {
        const res = await sendWeeklyEmailsNow(jobType);
        setNote(res.message);
        router.refresh();
      } catch (err) {
        setNote(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={
          variant === "primary"
            ? "rounded-md bg-gold-500 px-3 py-1.5 text-sm font-semibold text-app transition hover:bg-gold-600 disabled:opacity-50"
            : "rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover disabled:opacity-50"
        }
      >
        {pending ? "Sending…" : label}
      </button>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}
