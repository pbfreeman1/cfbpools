import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MatchupStrip from "@/app/components/MatchupStrip";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto min-h-screen max-w-md px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-gold-400">
          CFBPools.com
        </h1>
        <p className="mt-2 text-muted">Open pools for the 2026 college football season.</p>
      </div>

      <MatchupStrip />

      <div className="flex flex-col gap-4">
        <Link
          href="/survivor"
          className="block rounded-lg border border-edge p-4 transition hover:border-gold-500 hover:bg-surface-hover"
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">SEC Survivor Pool</h2>
            <span className="rounded-full bg-alive/15 px-2 py-0.5 text-xs font-medium text-alive">
              Open
            </span>
          </div>
          <p className="text-sm text-muted">
            Pick one SEC team to win each week. Lose and you&apos;re out. Last one standing wins
            the pot.
          </p>
        </Link>

        <div className="block rounded-lg border border-edge bg-surface p-4 opacity-70">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-muted">Weekly Pick&apos;em Pool</h2>
            <span className="rounded-full bg-edge px-2 py-0.5 text-xs font-medium text-muted">
              Coming soon
            </span>
          </div>
          <p className="text-sm text-muted">
            Pick 6 games against the spread each week. Go 6-0 to win the pot.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-md bg-gold-500 px-4 py-2.5 text-center text-base font-semibold text-app transition hover:bg-gold-600"
          >
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/signup"
              className="rounded-md bg-gold-500 px-4 py-2.5 text-center text-base font-semibold text-app transition hover:bg-gold-600"
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-edge px-4 py-2.5 text-center text-base font-medium text-ink transition hover:bg-surface-hover"
            >
              Log in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
