"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/adminAuth";
import { sendEmailWithResult, type EmailStream } from "@/lib/email";
import { formatKickoff } from "@/lib/formatDate";

const VALID_STREAMS: EmailStream[] = ["picks", "welcome", "updates"];

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
