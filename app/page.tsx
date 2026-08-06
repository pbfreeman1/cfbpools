export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold text-brand-700">CFBPools.com</h1>
      <p className="text-slate-600">
        Scaffold is live. Next up: Supabase Auth, the{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-sm">profiles</code>{" "}
        table, and the Survivor Pool pick UI.
      </p>
    </main>
  );
}
