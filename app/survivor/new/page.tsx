import { createEntry } from "@/app/actions/survivor";

export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm sm:max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">New Survivor entry</h1>
      <p className="mb-6 text-sm text-muted">
        Give it a name if you&apos;d like — otherwise we&apos;ll just call it your entry number.
      </p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}

      <form action={createEntry} className="flex flex-col gap-4">
        <div>
          <label htmlFor="entryName" className="mb-1 block text-sm font-medium text-ink">
            Entry name (optional)
          </label>
          <input
            id="entryName"
            name="entryName"
            type="text"
            placeholder="e.g. The Comeback Kids"
            className="w-full rounded-md border border-edge bg-app px-3 py-2 text-base text-ink placeholder:text-muted focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          />
        </div>
        <button
          type="submit"
          className="mt-2 rounded-md bg-gold-500 px-4 py-2.5 text-base font-semibold text-app transition hover:bg-gold-600"
        >
          Create entry
        </button>
      </form>
    </main>
  );
}
