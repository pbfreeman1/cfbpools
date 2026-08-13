import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-app px-6 py-12 text-center">
      <p className="font-data text-sm font-bold uppercase tracking-[0.3em] text-gold-400">
        4th &amp; long
      </p>
      <h1 className="mt-4 font-display text-[clamp(4rem,18vw,8rem)] font-bold uppercase leading-[0.9] tracking-tight text-ink">
        404
      </h1>
      <p className="mt-4 max-w-md font-display text-base uppercase tracking-[0.15em] text-muted sm:text-lg">
        This page didn&apos;t make the cut.
      </p>
      <Link
        href="/"
        className="mt-10 rounded-lg bg-gold-500 px-6 py-4 text-center font-display text-base font-bold uppercase tracking-wide text-app shadow-lg shadow-gold-500/20 transition hover:bg-gold-600 hover:shadow-gold-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        Back to CFBPools.com
      </Link>
    </main>
  );
}
