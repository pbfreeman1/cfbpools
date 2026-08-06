import { redirect } from "next/navigation";
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
    .select("display_name, is_admin")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12 text-center">
      <h1 className="mb-1 text-2xl font-bold text-brand-700">
        You&apos;re in{profile?.display_name ? `, ${profile.display_name}` : ""}.
      </h1>
      <p className="mb-1 text-sm text-slate-600">{user.email}</p>
      {profile?.is_admin && (
        <p className="mb-4 text-xs font-medium uppercase tracking-wide text-brand-600">Admin</p>
      )}
      <p className="mb-6 mt-4 text-sm text-slate-600">
        This confirms signup, email confirmation, login, and Supabase session handling are all
        working. The Survivor Pool entry flow is next.
      </p>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-4 py-2.5 text-base font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Log out
        </button>
      </form>
    </main>
  );
}
