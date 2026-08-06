import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-2xl font-bold text-brand-700">CFBPools.com</h1>
        <p className="mt-2 text-slate-600">
          SEC Survivor Pool &amp; Weekly College Football Pick&apos;em.
        </p>
      </div>
      <div className="flex w-full flex-col gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-brand-600 px-4 py-2.5 text-base font-semibold text-white transition hover:bg-brand-700"
        >
          Sign up
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-slate-300 px-4 py-2.5 text-base font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
