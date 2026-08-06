import { createEntry } from "@/app/actions/survivor";

export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="mb-1 text-2xl font-bold text-brand-700">New Survivor entry</h1>
      <p className="mb-6 text-sm text-slate-600">
        Give it a name if you&apos;d like — otherwise we&apos;ll just call it your entry number.
      </p>

      {params.error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>
      )}

      <form action={createEntry} className="flex flex-col gap-4">
        <div>
          <label htmlFor="entryName" className="mb-1 block text-sm font-medium text-slate-700">
            Entry name (optional)
          </label>
          <input
            id="entryName"
            name="entryName"
            type="text"
            placeholder="e.g. The Comeback Kids"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          className="mt-2 rounded-md bg-brand-600 px-4 py-2.5 text-base font-semibold text-white transition hover:bg-brand-700"
        >
          Create entry
        </button>
      </form>
    </main>
  );
}
