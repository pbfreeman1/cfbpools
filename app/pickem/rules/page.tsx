import Link from "next/link";

export default function PickemRulesPage() {
  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl lg:max-w-5xl">
      <Link href="/pickem" className="mb-4 inline-block text-sm text-pickem-400 hover:underline">
        &larr; Back to pool home
      </Link>
      <h1 className="mb-6 font-display text-3xl font-bold uppercase tracking-wide text-pickem-400">
        Pick&apos;em Pool Rules
      </h1>

      <div className="flex flex-col gap-6 text-sm text-ink">
        <section>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
            Object
          </h2>
          <p className="text-muted">
            Pick 6 games against the spread each week. Go 6-0 to win that week&apos;s pot.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
            How it works
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-muted">
            <li>Each week, a slate of games is posted with a point spread for each one.</li>
            <li>
              Choose any 6 of those games and pick which team you think will beat the spread.
            </li>
            <li>Go <span className="text-ink">6-0 against the spread</span> to win the pot.</li>
            <li>
              A <span className="text-ink">push</span> (the final margin lands exactly on the
              spread) counts as a loss, not a tie.
            </li>
            <li>Once a game kicks off, that pick is locked and cannot be changed.</li>
            <li>You can change an unlocked pick as often as you like, right up to kickoff.</li>
            <li>
              New entries and pick changes close once fewer than 6 games remain before kickoff
              for the week.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
            Entries
          </h2>
          <p className="text-muted">
            <span className="text-ink">Unlimited entries per person</span> — enter as many times
            as you&apos;d like each week. Each entry costs{" "}
            <span className="text-ink">$10, paid via Venmo to @brentfreeman1</span>.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
            The pot
          </h2>
          <p className="text-muted">
            Every entry costs $10, and the pot total shown is always tentative — it&apos;s only
            final once all entry fees for the week are actually collected. If more than one
            entry goes 6-0, the final pot is split evenly among them.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
            Winning
          </h2>
          <p className="text-muted">
            Standings update as games finish and are visible on the leaderboard. If no entry goes
            6-0 in a given week, the pool&apos;s handling of that week (rollover, best record, etc.)
            will be announced separately.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            A few notes
          </h2>
          <div className="flex flex-col gap-2 text-xs text-muted">
            <p>
              Scores, leaderboard standings, and pick results are shown for convenience and
              aren&apos;t official until reviewed and confirmed by the pool administrator. In the
              rare case of a scoring error or site issue, the administrator may correct results
              before anything is finalized.
            </p>
            <p>
              All entries, picks, and account activity are logged in detail to keep things fair
              for everyone. Anyone found exploiting a bug or unintended site behavior to gain an
              advantage will have all their entries removed from every pool, forfeit any
              winnings, and be banned from future pools.
            </p>
          </div>
        </section>
      </div>

      <Link
        href="/pickem"
        className="mt-8 block rounded-md bg-pickem-500 px-4 py-2.5 text-center text-sm font-semibold text-app transition hover:bg-pickem-600"
      >
        Back to pool home
      </Link>
    </main>
  );
}
