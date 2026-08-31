"use client";

import { deletePickemEntryAdmin } from "@/app/actions/admin-pickem-entries";

export default function DeletePickemEntryButton({
  entryId,
  label,
}: {
  entryId: string;
  label: string;
}) {
  return (
    <form
      action={deletePickemEntryAdmin}
      onSubmit={(e) => {
        if (!confirm(`Delete ${label}? This also deletes its picks and cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <button type="submit" className="text-xs font-medium text-dead hover:underline">
        Delete
      </button>
    </form>
  );
}
