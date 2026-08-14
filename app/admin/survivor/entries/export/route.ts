import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ data: entries }, { data: bonusPicks }] = await Promise.all([
    supabase
      .from("survivor_entries")
      .select(
        `id, entry_name, entry_number, status, eliminated_week_number, dues_paid, dues_paid_at,
         user:profiles!survivor_entries_user_id_fkey(first_name, last_name, email)`
      )
      .order("entry_number"),
    supabase.from("survivor_picks").select("entry_id").eq("is_bonus_week", true),
  ]);

  const bonusCountByEntry = new Map<string, number>();
  (bonusPicks ?? []).forEach((p) => {
    bonusCountByEntry.set(p.entry_id, (bonusCountByEntry.get(p.entry_id) ?? 0) + 1);
  });

  const header = [
    "First Name",
    "Last Name",
    "Email",
    "Entry Name",
    "Entry Number",
    "Status",
    "Eliminated Week",
    "Dues Paid",
    "Dues Paid At",
    "Bonus Weeks Used",
  ];

  const rows = (entries ?? []).map((e) => {
    const owner = e.user as unknown as { first_name: string | null; last_name: string | null; email: string | null } | null;
    const bonusUsed = bonusCountByEntry.get(e.id) ?? 0;
    return [
      owner?.first_name ?? "",
      owner?.last_name ?? "",
      owner?.email ?? "",
      e.entry_name ?? "",
      e.entry_number,
      e.status,
      e.eliminated_week_number ?? "",
      e.dues_paid ? "yes" : "no",
      e.dues_paid_at ?? "",
      bonusUsed,
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvField).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="survivor-entries-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
