import { runWeeklyEmails, type WeeklyJobType } from "@/lib/weeklyEmails";

// Node runtime (crypto + supabase-js service client); never statically cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_JOBS: WeeklyJobType[] = [
  "survivor_saturday",
  "pickem_saturday",
  "survivor_friday_reminder",
];

/**
 * Weekly pool email cron. Vercel invokes this every 15 min on Fri + Sat
 * (see vercel.json) — the handler itself decides whether it's actually time
 * to send. Auth: `Authorization: Bearer $CRON_SECRET` (what Vercel Cron
 * sends automatically), or `?secret=$CRON_SECRET` as a fallback for manual
 * triggers.
 *
 * Optional `?force=1` bypasses the day/time gate (still idempotent via the
 * email_campaigns unique constraint). `?job=` restricts to one job type.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const authed =
    !!secret &&
    (authHeader === `Bearer ${secret}` || url.searchParams.get("secret") === secret);

  if (!authed) {
    return new Response("Unauthorized", { status: 401 });
  }

  const force = url.searchParams.get("force") === "1";
  const jobParam = url.searchParams.get("job");
  const only =
    jobParam && VALID_JOBS.includes(jobParam as WeeklyJobType)
      ? ([jobParam] as WeeklyJobType[])
      : undefined;

  const result = await runWeeklyEmails({ force, only });
  return Response.json(result);
}
