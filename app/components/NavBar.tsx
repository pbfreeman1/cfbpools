import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
            <Link href="/dashboard" className="text-ink hover:text-gold-400">
              Dashboard
            </Link>
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
