import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto min-h-screen max-w-md px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-brand-700">CFBPools.com</h1>
        <p className="mt-2 text-slate-600">Open pools for the 2026 college football season.</p>
      </div>

      <div className="flex flex-col gap-4">
        <Link
          href="/survivor"
          className="block rounded-lg border border-slate-300 p-4 transition hover:border-brand-500 hover:bg-brand-50"
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">SEC Survivor Pool</h2>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Open
            </span>
          </div>
          <p className="text-sm text-slate-600">
            Pick one SEC team to win each week. Lose and you&apos;re out. Last one standing wins
            the pot.
          </p>
        </Link>

        <div className="block rounded-lg border border-slate-200 bg-slate-50 p-4 opacity-70">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-500">Weekly Pick&apos;em Pool</h2>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
              Coming soon
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Pick 6 games against the spread each week. Go 6-0 to win the pot.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-md bg-brand-600 px-4 py-2.5 text-center text-base font-semibold text-white transition hover:bg-brand-700"
          >
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/signup"
              className="rounded-md bg-brand-600 px-4 py-2.5 text-center text-base font-semibold text-white transition hover:bg-brand-700"
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-slate-300 px-4 py-2.5 text-center text-base font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Log in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
