"use client";

import { useTransition } from "react";
import { deleteEntryAdmin } from "@/app/actions/admin-survivor";

// Confirm gate lives in an onClick that only dispatches the server action
// on a positive confirm — rather than an onSubmit + preventDefault race
// against the form action, which was unreliable here.
export default function DeleteEntryButton({ entryId, label }: { entryId: string; label: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete ${label}? This also deletes its picks and cannot be undone.`)) return;
        const fd = new FormData();
        fd.set("entryId", entryId);
        startTransition(() => deleteEntryAdmin(fd));
      }}
      className="text-xs font-medium text-dead hover:underline disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
