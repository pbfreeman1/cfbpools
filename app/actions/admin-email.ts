"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/adminAuth";
import { sendEmailWithResult } from "@/lib/email";

export async function sendTestEmail(formData: FormData) {
  await requireAdmin();

  const to = (formData.get("to") as string) || "";
  if (!to) {
    redirect("/admin/email?error=" + encodeURIComponent("Enter a recipient address"));
  }

  const result = await sendEmailWithResult({
    to,
    subject: "CFBPools Admin — Test Email",
    html: `
      <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
        <p style="font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: #8B93A7; margin: 0 0 16px;">CFBPools.com</p>
        <h1 style="font-size: 20px; margin: 0 0 12px;">Test email</h1>
        <p>This confirms the Resend integration is working, sent from the admin portal at ${new Date().toLocaleString()}.</p>
      </div>
    `,
  });

  if (!result.ok) {
    redirect("/admin/email?error=" + encodeURIComponent(result.error || "Send failed"));
  }

  redirect("/admin/email?sent=1");
}
