import { createHmac, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

// Three sending streams, one Resend-verified subdomain each — keeps
// engagement/complaint metrics for transactional mail (picks, welcome)
// separate from bulk mail (weekly recaps), and keeps admin notifications on
// the same reputation pool as the transactional stream they ride along with.
export type EmailStream = "picks" | "welcome" | "updates";

const STREAM_ENV_VAR: Record<EmailStream, string> = {
  picks: "RESEND_FROM_PICKS",
  welcome: "RESEND_FROM_WELCOME",
  updates: "RESEND_FROM_UPDATES",
};

// "none" — only respects a scope='all' opt-out (all transactional sends).
// "bulk" — additionally respects a scope='bulk' opt-out (the weekly pool
// recap / reminder campaigns).
export type UnsubscribeCheck = "none" | "bulk";

type EmailInput = {
  to: string;
  subject: string;
  html: string;
  stream: EmailStream;
  unsubscribeCheck?: UnsubscribeCheck;
  headers?: Record<string, string>;
};
export type DeliverResult = {
  ok: boolean;
  error?: string;
  /** Set when the send was intentionally not attempted (recipient opted out). */
  skipped?: boolean;
  skipReason?: "unsubscribed_all" | "unsubscribed_bulk";
  messageId?: string;
};

// -- Unsubscribe token helpers ------------------------------------------------

/**
 * HMAC-SHA256 of the (lowercased) recipient email, keyed by EMAIL_UNSUB_SECRET.
 * This token — not RLS — is the access control on the unsubscribe page and
 * on the email_unsubscribes table. Returns null if the secret is unset.
 */
export function signToken(email: string): string | null {
  const secret = process.env.EMAIL_UNSUB_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
}

export function verifyToken(email: string, token: string): boolean {
  const expected = signToken(email);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Full unsubscribe URL for an email, or null if unbuildable (missing secret/site URL). */
export function unsubscribeUrl(email: string): string | null {
  const token = signToken(email);
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!token || !base) return null;
  return `${base.replace(/\/$/, "")}/unsubscribe?email=${encodeURIComponent(
    email.trim().toLowerCase()
  )}&token=${token}`;
}

/**
 * Checks the email_unsubscribes table (via the service-role client, since it
 * has no public read policy). Returns the reason the send should be skipped,
 * or null to proceed. Fails open — an infra error here must never silently
 * drop transactional mail.
 */
async function suppressionReason(
  email: string,
  mode: UnsubscribeCheck
): Promise<DeliverResult["skipReason"] | null> {
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from("email_unsubscribes")
      .select("scope")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    if (!data) return null;
    if (data.scope === "all") return "unsubscribed_all";
    if (data.scope === "bulk" && mode === "bulk") return "unsubscribed_bulk";
    return null;
  } catch {
    return null;
  }
}

async function deliverEmail(input: EmailInput): Promise<DeliverResult> {
  const { to, subject, html, stream } = input;
  const unsubscribeCheck: UnsubscribeCheck = input.unsubscribeCheck ?? "none";
  const apiKey = process.env.RESEND_API_KEY;
  const envVar = STREAM_ENV_VAR[stream];
  const from = process.env[envVar];

  if (!apiKey || !from) {
    return { ok: false, error: `RESEND_API_KEY or ${envVar} not set` };
  }

  // 'all'-scope opt-outs are honored unconditionally here so a template that
  // forgets to pass unsubscribeCheck can never bypass a full opt-out.
  const skipReason = await suppressionReason(to, unsubscribeCheck);
  if (skipReason) {
    return { ok: false, skipped: true, skipReason };
  }

  // Every bulk ("updates") send carries List-Unsubscribe headers so Gmail /
  // Apple Mail render a native one-click unsubscribe control.
  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  if (stream === "updates") {
    const url = unsubscribeUrl(to);
    if (url) {
      headers["List-Unsubscribe"] = `<${url}>, <mailto:pbfreeman7314@gmail.com?subject=unsubscribe>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `${res.status} ${await res.text()}` };
    }
    const json = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, messageId: json?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Thin wrapper around Resend's API. Deliberately never throws — a failed or
 * unconfigured email should never break the actual account/entry/pick
 * action it's attached to. Failures are logged, not surfaced to the user.
 */
export async function sendEmail(input: EmailInput): Promise<void> {
  const result = await deliverEmail(input);
  if (!result.ok && !result.skipped) {
    console.warn(`[email] Failed to send "${input.subject}" to ${input.to}: ${result.error}`);
  }
}

/**
 * Same delivery as sendEmail(), but reports success/failure instead of
 * swallowing it — for the admin test-email tool, where the whole point is
 * knowing whether it actually went out.
 */
export async function sendEmailWithResult(input: EmailInput): Promise<DeliverResult> {
  return deliverEmail(input);
}

/** Where admin notifications go — unset means those emails are skipped. */
export function adminEmail(): string | null {
  return process.env.ADMIN_EMAIL || null;
}

const wrapper = (bodyHtml: string) => `
<div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <p style="font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: #8B93A7; margin: 0 0 16px;">CFBPools.com</p>
  ${bodyHtml}
</div>
`;

export function welcomeToSurvivorPoolEmail({
  firstName,
  entryName,
  deadlineText,
}: {
  firstName: string;
  entryName: string;
  deadlineText: string;
}) {
  return wrapper(`
    <h1 style="font-size: 20px; margin: 0 0 12px;">You're in the SEC Survivor Pool!</h1>
    <p>Hi ${firstName},</p>
    <p>Your entry <strong>${entryName}</strong> is set up. Here's how it works:</p>
    <ul style="padding-left: 20px; line-height: 1.6;">
      <li>Each week, pick one SEC team you think will win.</li>
      <li>Win, you advance. Lose, you're eliminated.</li>
      <li>16 SEC teams, 14 weeks — you'll need a bonus pick (two teams, both must win) in exactly 2 weeks of your choosing.</li>
      <li>A team can only be used once per entry, all season.</li>
      <li>Picks lock the moment that team's game kicks off.</li>
    </ul>
    <p>Entry deadline is <strong>${deadlineText}</strong>.</p>
    <p><a href="https://cfbpools.com/survivor" style="color: #D99A26;">Go make your first pick &rarr;</a></p>
  `);
}

export function pickConfirmationEmail({
  firstName,
  entryName,
  weekNumber,
  teamName,
  isBonus,
  bonusTeamName,
}: {
  firstName: string;
  entryName: string;
  weekNumber: number;
  teamName: string;
  isBonus: boolean;
  bonusTeamName: string | null;
}) {
  return wrapper(`
    <h1 style="font-size: 20px; margin: 0 0 12px;">Pick confirmed — Week ${weekNumber}</h1>
    <p>Hi ${firstName},</p>
    <p>Your pick for <strong>${entryName}</strong> is confirmed:</p>
    <p style="font-size: 18px; font-weight: 600; margin: 16px 0;">
      ${teamName}${isBonus && bonusTeamName ? ` + ${bonusTeamName} (bonus week — both must win)` : ""}
    </p>
    <p>You can change this anytime before that game kicks off.</p>
    <p><a href="https://cfbpools.com/survivor" style="color: #D99A26;">View your entries &rarr;</a></p>
  `);
}

export function bonusPickConfirmationEmail({
  firstName,
  entryName,
  weekNumber,
  teamAName,
  teamBName,
}: {
  firstName: string;
  entryName: string;
  weekNumber: number;
  teamAName: string;
  teamBName: string;
}) {
  return wrapper(`
    <h1 style="font-size: 20px; margin: 0 0 12px;">Bonus pick confirmed — Week ${weekNumber}</h1>
    <p>Hi ${firstName},</p>
    <p>Your bonus pick for <strong>${entryName}</strong> is confirmed:</p>
    <p style="font-size: 18px; font-weight: 600; margin: 16px 0;">
      ${teamAName} + ${teamBName}
    </p>
    <p>Both teams must win this week for this entry to advance. You can change this anytime before either game kicks off.</p>
    <p><a href="https://cfbpools.com/survivor" style="color: #D99A26;">View your entries &rarr;</a></p>
  `);
}

export type PickemEmailPick = { gameLabel: string; teamName: string; spreadLabel: string };

export function pickemEntryConfirmationEmail({
  firstName,
  entryName,
  weekNumber,
  picks,
}: {
  firstName: string;
  entryName: string;
  weekNumber: number;
  picks: PickemEmailPick[];
}) {
  const picksHtml = picks
    .map((p) => `<li>${p.gameLabel}: <strong>${p.teamName} ${p.spreadLabel}</strong></li>`)
    .join("");
  return wrapper(`
    <h1 style="font-size: 20px; margin: 0 0 12px;">You're in — Pick'em Week ${weekNumber}</h1>
    <p>Hi ${firstName},</p>
    <p>Your entry <strong>${entryName}</strong> is set for Week ${weekNumber}:</p>
    <ul style="padding-left: 20px; line-height: 1.6;">${picksHtml}</ul>
    <p>Entries are unlimited — enter as many times as you'd like each week.</p>
    <p>The leaderboard and live scores will update as games kick off.</p>
    <p>You can still edit any pick on a game that hasn't kicked off yet — just go to <a href="https://cfbpools.com/pickem" style="color: #4C7EFF;">the Pick'em home page</a> and open this entry.</p>
    <p><a href="https://cfbpools.com/pickem" style="color: #4C7EFF;">View the Pick&apos;em pool &rarr;</a></p>
  `);
}

export function adminNewPickemEntryEmail({
  firstName,
  lastName,
  email,
  entryName,
  weekNumber,
  picks,
  createdAt,
}: {
  firstName: string;
  lastName: string;
  email: string;
  entryName: string;
  weekNumber: number;
  picks: PickemEmailPick[];
  createdAt: string;
}) {
  const picksHtml = picks
    .map((p) => `<li>${p.gameLabel}: <strong>${p.teamName} ${p.spreadLabel}</strong></li>`)
    .join("");
  return wrapper(`
    <h1 style="font-size: 18px; margin: 0 0 12px;">New Pick&apos;em entry</h1>
    <table style="border-collapse: collapse;">
      ${detailRow("Entry", entryName)}
      ${detailRow("Account", `${firstName} ${lastName} (${email})`)}
      ${detailRow("Pool", `Pick'em — Week ${weekNumber}`)}
      ${detailRow("Created", createdAt)}
    </table>
    <p style="margin-top: 12px; font-size: 13px; color: #8B93A7;">Picks:</p>
    <ul style="padding-left: 20px; line-height: 1.6;">${picksHtml}</ul>
  `);
}

const detailRow = (label: string, value: string) => `
  <tr>
    <td style="padding: 4px 12px 4px 0; color: #8B93A7; font-size: 13px; white-space: nowrap; vertical-align: top;">${label}</td>
    <td style="padding: 4px 0; font-size: 13px; vertical-align: top;">${value}</td>
  </tr>
`;

export function adminNewAccountEmail({
  firstName,
  lastName,
  email,
  phone,
  signedUpAt,
}: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  signedUpAt: string;
}) {
  return wrapper(`
    <h1 style="font-size: 18px; margin: 0 0 12px;">New account created</h1>
    <table style="border-collapse: collapse;">
      ${detailRow("Name", `${firstName} ${lastName}`)}
      ${detailRow("Email", email)}
      ${phone ? detailRow("Phone", phone) : ""}
      ${detailRow("Signed up", signedUpAt)}
    </table>
  `);
}

export function adminNewEntryEmail({
  firstName,
  lastName,
  email,
  entryName,
  entryNumber,
  createdAt,
}: {
  firstName: string;
  lastName: string;
  email: string;
  entryName: string;
  entryNumber: number;
  createdAt: string;
}) {
  return wrapper(`
    <h1 style="font-size: 18px; margin: 0 0 12px;">New Survivor Pool entry</h1>
    <table style="border-collapse: collapse;">
      ${detailRow("Entry", `${entryName} (#${entryNumber})`)}
      ${detailRow("Account", `${firstName} ${lastName} (${email})`)}
      ${detailRow("Pool", "SEC Survivor")}
      ${detailRow("Created", createdAt)}
    </table>
  `);
}

// -- Bulk ("updates" stream) pool campaign templates -------------------------

/** Plain-text-style unsubscribe footer for every bulk send. */
function bulkFooter(unsubUrl: string | null): string {
  if (!unsubUrl) return "";
  return `
    <p style="font-size: 12px; color: #8B93A7; margin: 24px 0 0; border-top: 1px solid #e5e7eb; padding-top: 12px;">
      Don&apos;t want these emails?
      <a href="${unsubUrl}" style="color: #8B93A7;">Unsubscribe</a>.
    </p>
  `;
}

export type SurvivorRecapEntry = { entryName: string; pickLabel: string };
export type TeamDistributionRow = { teamName: string; count: number; pct: number };

export function survivorSaturdayRecapEmail({
  firstName,
  weekNumber,
  entries,
  pickedCount,
  aliveCount,
  teamDistribution,
  viewPicksUrl,
  unsubscribeUrl,
}: {
  firstName: string;
  weekNumber: number;
  entries: SurvivorRecapEntry[];
  pickedCount: number;
  aliveCount: number;
  teamDistribution: TeamDistributionRow[];
  viewPicksUrl: string;
  unsubscribeUrl: string | null;
}) {
  const barRows = teamDistribution
    .map(
      (t) => `
      <tr>
        <td style="padding: 3px 8px 3px 0; font-size: 12px; white-space: nowrap; vertical-align: middle; color: #1a1a1a;">${t.teamName}</td>
        <td style="width: 100%; vertical-align: middle; padding: 3px 0;">
          <div style="background: #ECEEF2; width: 100%; height: 14px;">
            <div style="background: #D99A26; width: ${Math.max(
              2,
              Math.round(t.pct)
            )}%; height: 14px;"></div>
          </div>
        </td>
        <td style="padding: 3px 0 3px 8px; font-size: 12px; vertical-align: middle; color: #8B93A7;">${t.count}</td>
      </tr>`
    )
    .join("");

  const entriesHtml = entries
    .map(
      (e) =>
        `<li><strong>${e.entryName}</strong> — ${e.pickLabel}</li>`
    )
    .join("");

  return wrapper(`
    <h1 style="font-size: 20px; margin: 0 0 12px;">SEC Survivor — Week ${weekNumber}</h1>
    <p>Hi ${firstName},</p>
    <p><strong>${pickedCount}</strong> of <strong>${aliveCount}</strong> alive entries have made their Week ${weekNumber} pick.</p>
    ${
      entries.length > 0
        ? `<p style="margin-bottom: 4px;">Your alive ${
            entries.length === 1 ? "entry" : "entries"
          }:</p>
           <ul style="padding-left: 20px; line-height: 1.6; margin-top: 0;">${entriesHtml}</ul>`
        : ""
    }
    ${
      teamDistribution.length > 0
        ? `<p style="margin-bottom: 4px; font-size: 13px; color: #8B93A7;">Week ${weekNumber} pick distribution (live, all games):</p>
           <table style="width: 100%; border-collapse: collapse; margin: 4px 0 16px;">${barRows}</table>`
        : ""
    }
    <p><a href="${viewPicksUrl}" style="color: #D99A26;">View the Survivor pool &rarr;</a></p>
    ${bulkFooter(unsubscribeUrl)}
  `);
}

export type PickemRecapPick = {
  gameLabel: string;
  teamName: string;
  spreadLabel: string;
  locked: boolean;
};
export type PickemRecapEntry = { entryName: string; picks: PickemRecapPick[] };

export function pickemSaturdayRecapEmail({
  firstName,
  weekNumber,
  entries,
  ecount,
  leaderboardUrl,
  unsubscribeUrl,
}: {
  firstName: string;
  weekNumber: number;
  entries: PickemRecapEntry[];
  ecount: number;
  leaderboardUrl: string;
  unsubscribeUrl: string | null;
}) {
  const pot = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(ecount * 10);

  const entriesHtml = entries
    .map((e) => {
      const picksHtml =
        e.picks.length > 0
          ? e.picks
              .map(
                (p) =>
                  `<li>${p.gameLabel}: <strong>${p.teamName} ${p.spreadLabel}</strong>${
                    p.locked ? " (locked)" : " (open)"
                  }</li>`
              )
              .join("")
          : `<li style="color: #8B93A7;">No picks made yet</li>`;
      return `
        <p style="margin: 12px 0 4px;"><strong>${e.entryName}</strong></p>
        <ul style="padding-left: 20px; line-height: 1.6; margin-top: 0;">${picksHtml}</ul>`;
    })
    .join("");

  return wrapper(`
    <h1 style="font-size: 20px; margin: 0 0 12px;">Week ${weekNumber} College Football Pick&apos;em Pool</h1>
    <p>Hi ${firstName},</p>
    <p>As of right now we have <strong>${ecount}</strong> ${
      ecount === 1 ? "entry" : "entries"
    }, which puts our tentative pot at <strong>${pot}</strong>. The pot is tentative until entry fees are collected, and payouts complete by Wednesday of the following week.</p>
    ${entriesHtml || "<p>You have no entries for this week.</p>"}
    <p><a href="${leaderboardUrl}" style="color: #4C7EFF;">View the leaderboard &rarr;</a></p>
    <div style="font-size: 12px; color: #8B93A7; margin-top: 20px;">
      <p style="margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.04em;">A few notes</p>
      <p style="margin: 0 0 8px;">Scores, leaderboard standings, and pick results are shown for convenience and aren&apos;t official until reviewed and confirmed by the pool administrator. In the rare case of a scoring error or site issue, the administrator may correct results before anything is finalized.</p>
      <p style="margin: 0;">All entries, picks, and account activity are logged in detail to keep things fair for everyone. Anyone found exploiting a bug or unintended site behavior to gain an advantage will have all their entries removed from every pool, forfeit any winnings, and be banned from future pools.</p>
    </div>
    ${bulkFooter(unsubscribeUrl)}
  `);
}

export function survivorFridayReminderEmail({
  firstName,
  weekNumber,
  entryName,
  unsubscribeUrl,
}: {
  firstName: string;
  weekNumber: number;
  entryName: string;
  unsubscribeUrl: string | null;
}) {
  return wrapper(`
    <h1 style="font-size: 20px; margin: 0 0 12px;">Missing Week ${weekNumber} pick</h1>
    <p>Hi ${firstName},</p>
    <p>If you are receiving this email, then you have not submitted your Week ${weekNumber} pick for <strong>${entryName}</strong>. Please be sure to make your pick before the games start tomorrow.</p>
    <p>If you believe you&apos;re receiving this in error, email pbfreeman7314@gmail.com and include your pick.</p>
    <p><a href="https://cfbpools.com/survivor" style="color: #D99A26;">Make your pick &rarr;</a></p>
    ${bulkFooter(unsubscribeUrl)}
  `);
}
