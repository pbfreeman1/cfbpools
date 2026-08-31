import Link from "next/link";
import { ENTRY_DEADLINE } from "@/lib/season";
import { formatLongDate, formatTimeOnly } from "@/lib/formatDate";

export default function SurvivorRulesPage() {
  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl lg:max-w-5xl">
      <Link href="/survivor" className="mb-4 inline-block text-sm text-gold-400 hover:underline">
        &larr; Back to pool home
      </Link>
      <h1 className="mb-6 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        Survivor Pool Rules
      </h1>

      <div className="flex flex-col gap-6 text-sm text-ink">
        <section>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
            Object
          </h2>
          <p className="text-muted">
            Be the last one who survives by correctly picking one SEC team to win its matchup
            each week of the 2026 season.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
            How it works
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-muted">
            <li>Each week, pick one SEC team you think will win its game.</li>
            <li>Win → you advance to the next week. Lose → you&apos;re eliminated.</li>
            <li>
              There are 16 SEC teams but only 13 weeks in the regular season, so every entry must use a{" "}
              <span className="text-ink">bonus pick in exactly 2 weeks</span> of its choosing.
            </li>
            <li>
              In a bonus week, you pick two teams — both must win, or you&apos;re eliminated.
            </li>
            <li>
              A team can only be used <span className="text-ink">once per entry, for the whole season</span> —
              including bonus picks.
            </li>
            <li>
              You <span className="text-ink">MUST save a team to use in the SEC Championship</span> —
              if you don&apos;t have one of the teams remaining that are participating in the SEC Championship, then you will be ELIMINATED!
            </li>
            <li>Once a game kicks off, that pick is locked and cannot be changed.</li>
            <li>You can change an unlocked pick as often as you like, including future weeks.</li>
            <li>Other entries&apos; picks stay hidden until they&apos;re locked.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
            Entries
          </h2>
          <p className="text-muted">
            Up to 2 entries per person. Entry deadline is{" "}
            <span className="text-ink">
              {formatLongDate(ENTRY_DEADLINE)}{" "}
              at{" "}
              {formatTimeOnly(ENTRY_DEADLINE)}
            </span>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-ink">
            Winning
          </h2>
          <p className="text-muted">
            The pool continues until there&apos;s one sole survivor. If multiple entries are
            still alive after the SEC Championship, then they will have the option to compete in a Bowl Season tiebreaker or split the pot. 
          </p>
        </section>
      </div>

      <Link
        href="/survivor"
        className="mt-8 block rounded-md bg-gold-500 px-4 py-2.5 text-center text-sm font-semibold text-app transition hover:bg-gold-600"
      >
        Back to pool home
      </Link>
    </main>
  );
}
