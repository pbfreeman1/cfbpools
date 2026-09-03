import Link from "next/link";
import { verifyToken } from "@/lib/email";
import { submitUnsubscribe } from "./actions";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string;
    token?: string;
    invalid?: string;
    done?: string;
  }>;
}) {
  const params = await searchParams;
  const email = (params.email || "").trim().toLowerCase();
  const token = params.token || "";
  const valid = !params.invalid && email !== "" && verifyToken(email, token);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.05em] text-muted">
        CFBPools.com
      </p>

      {params.done ? (
        <div className="rounded-lg border border-edge bg-surface p-5">
          <h1 className="mb-2 font-display text-xl font-bold uppercase tracking-wide text-ink">
            You&apos;re unsubscribed
          </h1>
          <p className="text-sm text-muted">
            {params.done === "all"
              ? "You will no longer receive any emails from CFBPools."
              : "You will no longer receive weekly pool recap or reminder emails. Pick confirmations and account emails will still be sent."}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium text-gold-400 hover:underline"
          >
            &larr; Back to CFBPools
          </Link>
        </div>
      ) : !valid ? (
        <div className="rounded-lg border border-edge bg-surface p-5">
          <h1 className="mb-2 font-display text-xl font-bold uppercase tracking-wide text-ink">
            Invalid or expired link
          </h1>
          <p className="text-sm text-muted">
            This unsubscribe link isn&apos;t valid. If you keep getting emails you don&apos;t want,
            email pbfreeman7314@gmail.com and we&apos;ll take care of it.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium text-gold-400 hover:underline"
          >
            &larr; Back to CFBPools
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-edge bg-surface p-5">
          <h1 className="mb-2 font-display text-xl font-bold uppercase tracking-wide text-ink">
            Unsubscribe
          </h1>
          <p className="mb-4 text-sm text-muted">
            Managing email preferences for <span className="font-medium text-ink">{email}</span>.
          </p>

          <form className="flex flex-col gap-3">
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="token" value={token} />

            <button
              type="submit"
              name="scope"
              value="bulk"
              formAction={submitUnsubscribe}
              className="rounded-md border border-edge bg-app px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-hover"
            >
              Unsubscribe from pool recap emails
            </button>
            <button
              type="submit"
              name="scope"
              value="all"
              formAction={submitUnsubscribe}
              className="rounded-md bg-dead/10 px-4 py-2.5 text-sm font-semibold text-dead transition hover:bg-dead/20"
            >
              Unsubscribe from all CFBPools emails
            </button>
          </form>

          <p className="mt-4 text-xs text-muted">
            &ldquo;Pool recap emails&rdquo; are the weekly Survivor and Pick&apos;em recap and
            reminder messages. &ldquo;All emails&rdquo; also stops pick confirmations and account
            notifications.
          </p>
        </div>
      )}
    </main>
  );
}
