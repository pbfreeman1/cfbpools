import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { toggleIsAdmin } from "@/app/actions/admin-users";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user: me },
  } = await supabase.auth.getUser();

  const [{ data: profiles }, { data: survivorEntries }] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name, email, is_admin, created_at").order("created_at"),
    supabase.from("survivor_entries").select("user_id"),
  ]);

  const survivorUserIds = new Set((survivorEntries ?? []).map((e) => e.user_id));

  const q = (params.q || "").trim().toLowerCase();
  const filtered = (profiles ?? []).filter((p) => {
    if (!q) return true;
    const haystack = [p.first_name, p.last_name, p.email].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">Users</h1>
      <p className="mb-6 text-sm text-muted">{profiles?.length ?? 0} registered accounts.</p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}

      <form action="/admin/users" method="GET" className="mb-4 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={params.q || ""}
          placeholder="Search name or email…"
          className="w-64 rounded-md border border-edge bg-app px-3 py-1.5 text-sm text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
        >
          Search
        </button>
        {params.q && (
          <Link href="/admin/users" className="self-center text-sm text-muted hover:text-gold-400">
            Clear
          </Link>
        )}
      </form>

      <div className="divide-y divide-edge rounded-lg border border-edge bg-surface">
        <div className="grid grid-cols-[1.5fr_auto_auto_auto] gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <span>User</span>
          <span>Survivor</span>
          <span>Pick&apos;em</span>
          <span>Admin</span>
        </div>
        {filtered.map((p) => {
          const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || "—";
          const isSelf = p.id === me?.id;
          return (
            <div key={p.id} className="grid grid-cols-[1.5fr_auto_auto_auto] items-center gap-3 px-4 py-2.5">
              <div>
                <p className="text-sm text-ink">{name}</p>
                <p className="text-xs text-muted">{p.email || "no email"}</p>
              </div>
              <span className={`text-xs font-medium ${survivorUserIds.has(p.id) ? "text-alive" : "text-muted"}`}>
                {survivorUserIds.has(p.id) ? "Yes" : "—"}
              </span>
              <span className="text-xs text-muted">— (not built)</span>
              {isSelf ? (
                <span
                  title="Can't change your own admin status"
                  className="w-fit rounded bg-gold-500/10 px-2 py-0.5 text-xs font-medium text-gold-400"
                >
                  {p.is_admin ? "Admin (you)" : "You"}
                </span>
              ) : (
                <form action={toggleIsAdmin}>
                  <input type="hidden" name="userId" value={p.id} />
                  <input type="hidden" name="nextValue" value={(!p.is_admin).toString()} />
                  <button
                    type="submit"
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      p.is_admin ? "bg-gold-500/10 text-gold-400" : "bg-surface-hover text-muted"
                    }`}
                  >
                    {p.is_admin ? "Admin" : "Make admin"}
                  </button>
                </form>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="px-4 py-3 text-sm text-muted">No users match.</p>}
      </div>
    </div>
  );
}
