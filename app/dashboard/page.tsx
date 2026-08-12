import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, is_admin")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm sm:max-w-md flex-col justify-center px-6 py-12 text-center">
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-gold-400">
        You&apos;re in{profile?.first_name ? `, ${profile.first_name}` : ""}.
      </h1>
      <p className="mb-1 text-sm text-muted">{user.email}</p>
      {profile?.is_admin && (
        <p className="mb-4 text-xs font-medium uppercase tracking-wide text-gold-400">Admin</p>
      )}
      <p className="mb-6 mt-4 text-sm text-muted">
        This confirms signup, email confirmation, login, and Supabase session handling are all
        working.
      </p>
      <Link
        href="/survivor"
        className="mb-3 block rounded-md bg-gold-500 px-4 py-2.5 text-center text-base font-semibold text-app transition hover:bg-gold-600"
      >
        SEC Survivor Pool
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-edge px-4 py-2.5 text-base font-medium text-ink transition hover:bg-surface-hover"
        >
          Log out
        </button>
      </form>
    </main>
  );
}
