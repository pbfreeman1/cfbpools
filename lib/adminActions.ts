import type { createClient } from "@/lib/supabase/server";

export async function logAdminAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminId: string,
  action: string,
  targetTable: string,
  targetId: string,
  previousValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
  note: string
) {
  const { error } = await supabase.from("admin_actions").insert({
    admin_id: adminId,
    action,
    target_table: targetTable,
    target_id: targetId,
    previous_value: previousValue,
    new_value: newValue,
    note,
  });
  if (error) {
    // The underlying change already succeeded — losing the audit row
    // shouldn't roll that back, but it must not be silent either.
    console.error(`[admin_actions] Failed to log ${action} for ${targetId}:`, error.message);
  }
}
