import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS. Use ONLY in trusted
 * server-side contexts where the request has already been authorized some
 * other way (an admin server action after requireAdmin(), the cron route
 * after its CRON_SECRET check, or the unsubscribe page where the HMAC token
 * is the access control).
 *
 * Throws if SUPABASE_SERVICE_ROLE_KEY is unset — callers that must not break
 * when email infra is unconfigured (e.g. the suppression check in
 * lib/email.ts) should wrap this in try/catch and fail open.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
