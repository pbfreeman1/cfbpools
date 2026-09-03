"use server";

import { redirect } from "next/navigation";
import { verifyToken } from "@/lib/email";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Records an unsubscribe. Access control is the HMAC token (verified here
 * again, not just on the page), NOT RLS — email_unsubscribes has no public
 * insert policy by design, so this writes via the service-role client.
 */
export async function submitUnsubscribe(formData: FormData) {
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const token = (formData.get("token") as string) || "";
  const scopeInput = (formData.get("scope") as string) || "";
  const scope = scopeInput === "all" ? "all" : "bulk";

  if (!email || !verifyToken(email, token)) {
    redirect("/unsubscribe?invalid=1");
  }

  try {
    const supabase = createServiceClient();
    await supabase
      .from("email_unsubscribes")
      .upsert(
        { email, scope, source: "unsubscribe_page", unsubscribed_at: new Date().toISOString() },
        { onConflict: "email" }
      );
  } catch {
    redirect("/unsubscribe?invalid=1");
  }

  redirect(`/unsubscribe?done=${scope}&email=${encodeURIComponent(email)}&token=${token}`);
}
