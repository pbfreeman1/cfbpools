"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const VALID_PAYMENT_METHODS = ["venmo", "paypal", "other"] as const;

export async function updatePaymentInfo(formData: FormData) {
  const paymentMethod = formData.get("paymentMethod") as string;
  const paymentHandle = ((formData.get("paymentHandle") as string) || "").trim();

  if (!VALID_PAYMENT_METHODS.includes(paymentMethod as (typeof VALID_PAYMENT_METHODS)[number])) {
    redirect(`/dashboard?error=${encodeURIComponent("Choose a valid payment method")}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ payment_method: paymentMethod, payment_handle: paymentHandle || null })
    .eq("id", user.id);

  if (error) {
    redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?payment_saved=1");
}
