import { createClient } from "@/lib/supabase/server";
import { formatKickoff } from "@/lib/formatDate";
import { sendTestEmail } from "@/app/actions/admin-email";
import {
  copyPickemEntrantEmails,
  copyAliveSurvivorEmails,
  copyAliveSurvivorNoPickEmails,
} from "@/app/actions/admin-email";
import CopyEmailsButton from "./CopyEmailsButton";
import SendNowButton from "./SendNowButton";

export const dynamic = "force-dynamic";

type CampaignRow = {
  id: string;
  job_type: string;
  schedule_id: string;
  subject: string;
  status: string;
  recipient_count: number;
  sent_at: string | null;
  error: string | null;
  created_at: string;
};
type SendRow = {
  campaign_id: string;
  recipient_email: string;
  status: string;
  error: string | null;
  created_at: string;
};

const JOB_LABEL: Record<string, string> = {
  survivor_saturday: "Survivor — Saturday recap",
  pickem_saturday: "Pick'em — Saturday recap",
  survivor_friday_reminder: "Survivor — Friday reminder",
};

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-alive/10 text-alive",
  sending: "bg-gold-500/10 text-gold-400",
  pending: "bg-edge text-muted",
  failed: "bg-dead/10 text-dead",
};

export default async function AdminEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: campaignRows } = await supabase
    .from("email_campaigns")
    .select("id, job_type, schedule_id, subject, status, recipient_count, sent_at, error, created_at")
    .order("created_at", { ascending: false })
    .limit(8);
  const campaigns = (campaignRows ?? []) as CampaignRow[];

  const scheduleIds = [...new Set(campaigns.map((c) => c.schedule_id))];
  const { data: weekRows } = scheduleIds.length
    ? await supabase.from("schedule").select("id, week_number, label").in("id", scheduleIds)
    : { data: [] as { id: string; week_number: number; label: string | null }[] };
  const weekById = new Map((weekRows ?? []).map((w) => [w.id, w]));

  const campaignIds = campaigns.map((c) => c.id);
  const { data: sendRows } = campaignIds.length
    ? await supabase
        .from("email_sends")
        .select("campaign_id, recipient_email, status, error, created_at")
        .in("campaign_id", campaignIds)
        .order("recipient_email")
    : { data: [] as SendRow[] };
  const sends = (sendRows ?? []) as SendRow[];

  const sendsByCampaign = new Map<string, SendRow[]>();
  for (const s of sends) {
    const arr = sendsByCampaign.get(s.campaign_id) ?? [];
    arr.push(s);
    sendsByCampaign.set(s.campaign_id, arr);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        Email
      </h1>
      <p className="mb-6 text-sm text-muted">Diagnostics, manual sends, and the weekly campaign log.</p>

      {params.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{params.error}</p>
      )}
      {params.sent && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">Test email sent.</p>
      )}

      <div className="mb-6 rounded-lg border border-edge bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Send Test Email
        </h2>
        <p className="mb-3 text-xs text-muted">
          Sends via the live Resend config and reports whether it actually went out — pick a
          stream to confirm that sender&apos;s DNS/SMTP setup independently.
        </p>
        <form action={sendTestEmail} className="flex flex-wrap gap-2">
          <input
            type="email"
            name="to"
            required
            placeholder="you@example.com"
            className="min-w-0 flex-1 rounded-md border border-edge bg-app px-3 py-2 text-sm text-ink placeholder:text-muted"
          />
          <select
            name="stream"
            defaultValue="picks"
            className="rounded-md border border-edge bg-app px-2 py-2 text-sm text-ink"
          >
            <option value="picks">picks (RESEND_FROM_PICKS)</option>
            <option value="welcome">welcome (RESEND_FROM_WELCOME)</option>
            <option value="updates">updates (RESEND_FROM_UPDATES)</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-gold-500 px-4 py-2 text-sm font-semibold text-app transition hover:bg-gold-600"
          >
            Send
          </button>
        </form>
      </div>

      <div className="mb-6 rounded-lg border border-edge bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Weekly Campaigns — Send Now
        </h2>
        <p className="mb-3 text-xs text-muted">
          Runs the job immediately, bypassing the Fri/Sat send window. Still idempotent — a job
          already sent for the current week is skipped. Recipients are live.
        </p>
        <div className="flex flex-wrap gap-3">
          <SendNowButton jobType="survivor_saturday" label="Send Survivor Saturday recap" />
          <SendNowButton jobType="pickem_saturday" label="Send Pick'em Saturday recap" />
          <SendNowButton jobType="survivor_friday_reminder" label="Send Survivor Friday reminder" />
        </div>
        <div className="mt-3 border-t border-edge pt-3">
          <SendNowButton label="Run all due jobs now" variant="primary" />
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-edge bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Copy Emails</h2>
        <p className="mb-3 text-xs text-muted">
          Copies a comma-separated, deduped address list to the clipboard.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <CopyEmailsButton label="Current-week Pick'em entrants" action={copyPickemEntrantEmails} />
          <CopyEmailsButton label="Alive Survivor entries" action={copyAliveSurvivorEmails} />
          <CopyEmailsButton
            label="Alive Survivor — no pick this week"
            action={copyAliveSurvivorNoPickEmails}
          />
        </div>
      </div>

      <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide text-ink">
        Campaign Log
      </h2>
      {campaigns.length === 0 ? (
        <p className="rounded-lg border border-edge bg-surface p-4 text-sm text-muted">
          No campaigns have run yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {campaigns.map((c) => {
            const week = weekById.get(c.schedule_id);
            const cSends = sendsByCampaign.get(c.id) ?? [];
            const byStatus = cSends.reduce<Record<string, number>>((acc, s) => {
              acc[s.status] = (acc[s.status] ?? 0) + 1;
              return acc;
            }, {});
            return (
              <details key={c.id} className="rounded-lg border border-edge bg-surface p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                      STATUS_STYLE[c.status] ?? "bg-edge text-muted"
                    }`}
                  >
                    {c.status}
                  </span>
                  <span className="font-medium text-ink">
                    {JOB_LABEL[c.job_type] ?? c.job_type}
                  </span>
                  <span className="text-muted">
                    {week ? `Week ${week.week_number}` : "—"}
                  </span>
                  <span className="text-muted">· {c.recipient_count} recipients</span>
                  <span className="ml-auto text-xs text-muted">
                    {c.sent_at
                      ? formatKickoff(c.sent_at)
                      : `created ${formatKickoff(c.created_at)}`}
                  </span>
                </summary>
                <div className="mt-3 border-t border-edge pt-3 text-xs">
                  <p className="mb-2 text-muted">
                    {c.subject}
                    {c.error && <span className="ml-2 text-dead">· {c.error}</span>}
                  </p>
                  <p className="mb-2 text-muted">
                    {Object.entries(byStatus)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ") || "No send rows recorded."}
                  </p>
                  {cSends.length > 0 && (
                    <div className="max-h-64 overflow-y-auto rounded-md border border-edge">
                      <table className="w-full text-left">
                        <tbody>
                          {cSends.map((s, i) => (
                            <tr key={`${s.campaign_id}-${s.recipient_email}-${i}`} className="border-b border-edge last:border-0">
                              <td className="px-2 py-1 text-ink">{s.recipient_email}</td>
                              <td className="px-2 py-1 text-muted">{s.status}</td>
                              <td className="px-2 py-1 text-dead">{s.error ?? ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
