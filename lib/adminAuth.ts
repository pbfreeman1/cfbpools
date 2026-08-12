import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Every admin server action calls this itself rather than relying on
// app/admin/layout.tsx's redirect — the layout only guards page rendering,
// not a direct POST to the action. RLS (and, for survivor_entries, the
// protect_survivor_entries_status trigger) enforce this too, but checking
// here gives a clean redirect instead of a raw Postgres failure.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/");

  return { supabase, user };
}
