"use client";

/**
 * Purely local checkbox staging helper — no server round-trip. Toggles every
 * checkbox associated with `formId` (via each checkbox's own `form="..."`
 * attribute, so this works regardless of where in the DOM each checkbox
 * actually sits). The real commit only happens when the master form's own
 * submit button is clicked.
 */
export default function CheckboxBulkToggle({ formId }: { formId: string }) {
  function setAll(checked: boolean) {
    document
      .querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${formId}"]`)
      .forEach((el) => {
        el.checked = checked;
      });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setAll(true)}
        className="text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        Check All
      </button>
      <span className="text-xs text-muted">&middot;</span>
      <button
        type="button"
        onClick={() => setAll(false)}
        className="text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        Uncheck All
      </button>
    </div>
  );
}
