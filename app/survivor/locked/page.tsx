import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function LockedPicksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("survivor_picks_locked")
    .select("entry_id, entry_name, week_number, team_name, is_bonus_week, bonus_team_name")
    .order("week_number", { ascending: false });

  const byWeek = new Map<number, typeof rows>();
  (rows ?? []).forEach((r) => {
    const list = byWeek.get(r.week_number) ?? [];
    list.push(r);
    byWeek.set(r.week_number, list);
  });
  const weekNumbers = Array.from(byWeek.keys()).sort((a, b) => b - a);

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12">
      <Link href="/survivor" className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        &larr; Back to entries
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-brand-700">Locked picks</h1>
      <p className="mb-6 text-sm text-slate-600">
        Only shows picks once that week&apos;s game has kicked off.
      </p>

      {weekNumbers.length === 0 && (
        <p className="text-sm text-slate-500">No picks are locked yet.</p>
      )}

      <div className="flex flex-col gap-6">
        {weekNumbers.map((wn) => (
          <div key={wn}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Week {wn}
            </h2>
            <ul className="flex flex-col gap-2">
              {byWeek.get(wn)!.map((r, i) => (
                <li
                  key={`${r.entry_id}-${i}`}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-800">{r.entry_name || "Entry"}</span>
                  <span className="text-slate-500"> &mdash; </span>
                  <span className="text-slate-700">
                    {r.team_name}
                    {r.is_bonus_week && r.bonus_team_name ? ` + ${r.bonus_team_name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
