import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "./AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Goes through the is_admin() security-definer helper rather than
  // selecting profiles.is_admin directly, so this check runs the exact
  // same trusted logic the RLS policies rely on.
  const { data: isAdmin } = await supabase.rpc("is_admin");

  if (!isAdmin) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-app md:flex">
      <aside className="border-b border-edge bg-surface md:flex md:min-h-screen md:w-60 md:flex-shrink-0 md:flex-col md:border-b-0 md:border-r">
        <div className="px-4 py-4">
          <Link
            href="/admin"
            className="font-display text-sm font-bold uppercase tracking-wide text-gold-400"
          >
            CFBPools Admin
          </Link>
        </div>
        <AdminNav />
        <div className="mt-auto px-4 pb-6 pt-2">
          <Link href="/" className="text-xs text-muted hover:text-gold-400">
            &larr; Back to site
          </Link>
        </div>
      </aside>
      <main className="flex-1 px-6 py-8 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
