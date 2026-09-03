"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import { sendEmailWithResult, type EmailStream } from "@/lib/email";
import { formatKickoff } from "@/lib/formatDate";
import { runWeeklyEmails, type WeeklyJobType, type JobResult } from "@/lib/weeklyEmails";

const VALID_STREAMS: EmailStream[] = ["picks", "welcome", "updates"];
const VALID_JOBS: WeeklyJobType[] = [
  "survivor_saturday",
  "pickem_saturday",
  "survivor_friday_reminder",
];

export async function sendTestEmail(formData: FormData) {
  await requireAdmin();

  const to = (formData.get("to") as string) || "";
  if (!to) {
    redirect("/admin/email?error=" + encodeURIComponent("Enter a recipient address"));
  }

  const streamInput = formData.get("stream") as string;
  const stream = VALID_STREAMS.includes(streamInput as EmailStream) ? (streamInput as EmailStream) : "picks";

  const result = await sendEmailWithResult({
    to,
    subject: `CFBPools Admin — Test Email (${stream})`,
    html: `
      <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
        <p style="font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: #8B93A7; margin: 0 0 16px;">CFBPools.com</p>
        <h1 style="font-size: 20px; margin: 0 0 12px;">Test email — ${stream} stream</h1>
        <p>This confirms the Resend integration is working for the <strong>${stream}</strong> sender, sent from the admin portal at ${formatKickoff(new Date())}.</p>
      </div>
    `,
    stream,
  });

  if (!result.ok) {
    redirect("/admin/email?error=" + encodeURIComponent(result.error || "Send failed"));
  }

  redirect("/admin/email?sent=1");
}

// -- Weekly pool campaigns --------------------------------------------------

/**
 * Manual trigger for the weekly email jobs — the admin "Send now" path.
 * Rather than self-POSTing to /api/cron/weekly-emails with the secret (which
 * can't be exposed to the browser), this calls the same shared job runner
 * directly after an admin check. `force: true` bypasses the day/time gate;
 * idempotency still holds via the email_campaigns unique constraint.
 */
export async function sendWeeklyEmailsNow(jobType?: string): Promise<{
  ok: boolean;
  message: string;
  results: JobResult[];
}> {
  await requireAdmin();

  const only =
    jobType && VALID_JOBS.includes(jobType as WeeklyJobType)
      ? ([jobType] as WeeklyJobType[])
      : undefined;

  const run = await runWeeklyEmails({ force: true, only });

  const summary = run.results
    .map((r) => {
      if (r.outcome === "sent") {
        return `${r.jobType}: sent ${r.sentCount ?? 0}${
          r.skippedCount ? `, skipped ${r.skippedCount}` : ""
        }${r.failedCount ? `, failed ${r.failedCount}` : ""}`;
      }
      if (r.outcome === "skipped_duplicate") return `${r.jobType}: already sent`;
      if (r.outcome === "no_current_week") return `${r.jobType}: no current week set`;
      if (r.outcome === "failed") return `${r.jobType}: failed — ${r.error ?? "unknown"}`;
      return `${r.jobType}: not due`;
    })
    .join(" · ");

  revalidatePath("/admin/email");

  const anySent = run.results.some((r) => r.outcome === "sent");
  const anyFailed = run.results.some((r) => r.outcome === "failed");
  return {
    ok: anySent && !anyFailed,
    message: summary || "Nothing to do.",
    results: run.results,
  };
}

// -- "Copy emails" list builders -----------------------------------------

async function currentScheduleId() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("app_settings").select("current_week_id").single();
  return { supabase, scheduleId: (data?.current_week_id as string | null) ?? null };
}

function dedupeEmails(rows: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rows) {
    const e = (raw || "").trim().toLowerCase();
    if (e && !seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out.sort();
}

/** (a) Current-week Pick'em entrant emails. */
export async function copyPickemEntrantEmails(): Promise<string[]> {
  const { supabase, scheduleId } = await currentScheduleId();
  if (!scheduleId) return [];
  const { data } = await supabase
    .from("pickem_entries")
    .select("entrant_email")
    .eq("schedule_id", scheduleId);
  return dedupeEmails((data ?? []).map((r) => r.entrant_email as string | null));
}

/** (b) Alive Survivor entries' account emails. */
export async function copyAliveSurvivorEmails(): Promise<string[]> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("survivor_entries")
    .select("user:profiles!survivor_entries_user_id_fkey(email)")
    .eq("status", "active");
  return dedupeEmails(
    (data ?? []).map(
      (r) => (r as unknown as { user: { email: string | null } | null }).user?.email
    )
  );
}

/** (c) Alive Survivor entries with no pick for the current week. */
export async function copyAliveSurvivorNoPickEmails(): Promise<string[]> {
  const { supabase, scheduleId } = await currentScheduleId();
  if (!scheduleId) return [];

  const { data: entries } = await supabase
    .from("survivor_entries")
    .select("id, user:profiles!survivor_entries_user_id_fkey(email)")
    .eq("status", "active");

  const entryList = (entries ?? []) as unknown as {
    id: string;
    user: { email: string | null } | null;
  }[];
  if (entryList.length === 0) return [];

  const { data: picks } = await supabase
    .from("survivor_picks")
    .select("entry_id")
    .eq("schedule_id", scheduleId)
    .in(
      "entry_id",
      entryList.map((e) => e.id)
    );
  const hasPick = new Set((picks ?? []).map((p) => p.entry_id));

  return dedupeEmails(
    entryList.filter((e) => !hasPick.has(e.id)).map((e) => e.user?.email)
  );
}
