import { createServiceClient } from "@/lib/supabase/service";
import { fetchAll } from "@/lib/supabase/fetchAll";

// Node runtime (service-role supabase-js client); never statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only export of one week's Pick'em entries, for the payment-verification
 * Google Sheet (Apps Script). Auth: `Authorization: Bearer $PAYMENT_EXPORT_TOKEN`
 * — a dedicated, single-purpose secret (NOT CRON_SECRET or the service-role key)
 * so the sheet can read this one dataset and nothing else. Rotate it by changing
 * the env var and the Apps Script property.
 *
 * GET /api/admin/pickem-entries?season=2026&week=9
 *
 * Returns every entry for that week EXCEPT test entries, i.e. entries with no
 * resolvable email (profile email, else the entry's entrant_email).
 */

type EntryRow = {
  id: string;
  entry_name: string | null;
  entrant_email: string | null;
  rownum: number | null;
  is_ecount_eligible: boolean | null;
  created_at: string;
  user: { first_name: string | null; last_name: string | null; email: string | null } | null;
};

type TestEntryRow = {
  entry_id: string;
  first_name: string | null;
  last_name: string | null;
};

export async function GET(req: Request) {
  const token = process.env.PAYMENT_EXPORT_TOKEN;
  const authHeader = req.headers.get("authorization");
  if (!token || authHeader !== `Bearer ${token}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season"));
  const week = Number(url.searchParams.get("week"));
  if (!Number.isInteger(season) || !Number.isInteger(week)) {
    return Response.json({ error: "season and week (integers) are required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: scheduleRows, error: scheduleError } = await supabase
    .from("schedule")
    .select("id, label")
    .eq("season", season)
    .eq("week_number", week);
  if (scheduleError) {
    return Response.json({ error: scheduleError.message }, { status: 500 });
  }
  if (!scheduleRows || scheduleRows.length === 0) {
    return Response.json({ error: `No schedule row for season ${season} week ${week}` }, { status: 404 });
  }
  const scheduleIds = scheduleRows.map((s) => s.id);

  // Paged — PostgREST silently truncates at 1,000 rows.
  const entries = await fetchAll<EntryRow>((from, to) =>
    supabase
      .from("pickem_entries")
      .select(
        `id, entry_name, entrant_email, rownum, is_ecount_eligible, created_at,
         user:profiles!pickem_entries_user_id_fkey(first_name, last_name, email)`
      )
      .in("schedule_id", scheduleIds)
      .order("id")
      .range(from, to)
  );

  const entryIds = entries.map((e) => e.id);
  const testRows: TestEntryRow[] = [];
  // Chunk the .in() list so the request URL stays well under length limits.
  for (let i = 0; i < entryIds.length; i += 200) {
    const { data } = await supabase
      .from("pickem_test_entries")
      .select("entry_id, first_name, last_name")
      .in("entry_id", entryIds.slice(i, i + 200));
    if (data) testRows.push(...(data as TestEntryRow[]));
  }
  const testByEntry = new Map(testRows.map((t) => [t.entry_id, t]));

  const out = entries
    .map((e) => {
      const t = testByEntry.get(e.id);
      return {
        first_name: (e.user?.first_name ?? t?.first_name ?? "").trim(),
        last_name: (e.user?.last_name ?? t?.last_name ?? "").trim(),
        email: (e.user?.email ?? e.entrant_email ?? "").trim(),
        entry_name: e.entry_name ?? "",
        rownum: e.rownum,
        is_ecount_eligible: e.is_ecount_eligible,
        created_at: e.created_at,
      };
    })
    .filter((e) => e.email !== ""); // drop test entries (no email)

  out.sort(
    (a, b) =>
      a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" }) ||
      a.last_name.localeCompare(b.last_name, undefined, { sensitivity: "base" }) ||
      (a.rownum ?? 0) - (b.rownum ?? 0)
  );

  return Response.json({ season, week, count: out.length, entries: out });
}
