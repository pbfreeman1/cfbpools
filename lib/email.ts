type EmailInput = { to: string; subject: string; html: string };
type DeliverResult = { ok: boolean; error?: string };

async function deliverEmail({ to, subject, html }: EmailInput): Promise<DeliverResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return { ok: false, error: "RESEND_API_KEY or RESEND_FROM_EMAIL not set" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!res.ok) {
      return { ok: false, error: `${res.status} ${await res.text()}` };
    }
    return { ok: true };
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
  if (!result.ok) {
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

export function adminNewAccountEmail({
  firstName,
  lastName,
  email,
}: {
  firstName: string;
  lastName: string;
  email: string;
}) {
  return wrapper(`
    <h1 style="font-size: 18px; margin: 0 0 8px;">New account created</h1>
    <p>${firstName} ${lastName} (${email}) just signed up.</p>
  `);
}

export function adminNewEntryEmail({
  firstName,
  lastName,
  email,
  entryName,
}: {
  firstName: string;
  lastName: string;
  email: string;
  entryName: string;
}) {
  return wrapper(`
    <h1 style="font-size: 18px; margin: 0 0 8px;">New Survivor Pool entry</h1>
    <p>${firstName} ${lastName} (${email}) created entry "${entryName}".</p>
  `);
}
