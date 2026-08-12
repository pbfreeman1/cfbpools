import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

function getInitials(firstName: string | null | undefined, lastName: string | null | undefined, email: string | null | undefined) {
  const f = firstName?.trim()?.[0];
  const l = lastName?.trim()?.[0];
  if (f || l) return `${f ?? ""}${l ?? ""}`.toUpperCase();
  return (email?.trim()?.[0] ?? "?").toUpperCase();
}

export default async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initials: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();
    initials = getInitials(profile?.first_name, profile?.last_name, user.email);
  }

  return (
    <nav className="border-b border-edge bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="font-display text-lg font-bold uppercase tracking-wide text-gold-400"
        >
          CFBPools
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/survivor" className="text-ink hover:text-gold-400">
            Survivor
          </Link>
          <span className="text-muted" title="Coming soon">
            Pick&apos;em
          </span>
          {user ? (
            <>
              <Link href="/dashboard" className="text-ink hover:text-gold-400">
                Dashboard
              </Link>
              <Link
                href="/dashboard"
                title={user.email ?? undefined}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gold-500 text-xs font-bold text-app transition hover:bg-gold-600"
              >
                {initials}
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="text-ink hover:text-gold-400">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-gold-500 px-3 py-1.5 font-semibold text-app hover:bg-gold-600"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
