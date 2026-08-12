import { sendTestEmail } from "@/app/actions/admin-email";

export default async function AdminEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        Email
      </h1>
      <p className="mb-6 text-sm text-muted">Diagnostics and manual sends via Resend.</p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}
      {params.sent && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">Test email sent.</p>
      )}

      <div className="mb-6 rounded-lg border border-edge bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Send Test Email
        </h2>
        <p className="mb-3 text-xs text-muted">
          Sends via the live Resend config (RESEND_API_KEY / RESEND_FROM_EMAIL) and reports
          whether it actually went out.
        </p>
        <form action={sendTestEmail} className="flex gap-2">
          <input
            type="email"
            name="to"
            required
            placeholder="you@example.com"
            className="flex-1 rounded-md border border-edge bg-app px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
          <button
            type="submit"
            className="rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600"
          >
            Send
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-edge bg-surface p-4 opacity-60">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Weekly Recap / Reminder
        </h2>
        <p className="mb-3 text-xs text-muted">
          Coming soon — recap content generation (who&apos;s alive, who still needs to pick) isn&apos;t
          built yet.
        </p>
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-md border border-edge px-4 py-2 text-sm font-medium text-muted"
        >
          Send Weekly Recap
        </button>
      </div>
    </div>
  );
}
