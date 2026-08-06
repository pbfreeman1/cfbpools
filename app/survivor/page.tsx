import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SurvivorHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entries } = await supabase
    .from("survivor_entries")
    .select("id, entry_number, entry_name, status")
    .eq("user_id", user.id)
    .order("entry_number");

  const canCreateAnother = (entries?.length ?? 0) < 2;

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12">
      <h1 className="mb-1 text-2xl font-bold text-brand-700">SEC Survivor Pool</h1>
      <p className="mb-6 text-sm text-slate-600">Up to 2 entries per person.</p>

      {params.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
      )}

      {!entries || entries.length === 0 ? (
        <p className="mb-6 text-sm text-slate-600">You don&apos;t have an entry yet.</p>
      ) : (
        <ul className="mb-6 flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/survivor/${entry.id}`}
                className="flex items-center justify-between rounded-md border border-slate-300 px-4 py-3 transition hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">
                  {entry.entry_name || `Entry ${entry.entry_number}`}
                </span>
                <span
                  className={
                    entry.status === "eliminated"
                      ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                      : "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                  }
                >
                  {entry.status === "eliminated" ? "Eliminated" : "Alive"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canCreateAnother && (
        <Link
          href="/survivor/new"
          className="mb-3 block rounded-md bg-brand-600 px-4 py-2.5 text-center text-base font-semibold text-white transition hover:bg-brand-700"
        >
          Create {entries && entries.length > 0 ? "second" : "an"} entry
        </Link>
      )}

      <Link
        href="/survivor/locked"
        className="block rounded-md border border-slate-300 px-4 py-2.5 text-center text-base font-medium text-slate-700 transition hover:bg-slate-100"
      >
        View locked picks
      </Link>
    </main>
  );
}
