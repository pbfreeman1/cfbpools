import { createServiceClient } from "@/lib/supabase/service";
import { sendEmailWithResult, unsubscribeUrl } from "@/lib/email";
import {
  survivorSaturdayRecapEmail,
  pickemSaturdayRecapEmail,
  survivorFridayReminderEmail,
  type SurvivorRecapEntry,
  type TeamDistributionRow,
  type PickemRecapEntry,
  type PickemRecapPick,
} from "@/lib/email";

// Alive Survivor entries carry status 'active' (not 'alive') — see
// survivor_entries.status usage across the app.
const SURVIVOR_ALIVE_STATUS = "active";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://cfbpools.com").replace(/\/$/, "");

export type WeeklyJobType =
  | "survivor_saturday"
  | "pickem_saturday"
  | "survivor_friday_reminder";

const ALL_JOBS: WeeklyJobType[] = [
  "survivor_saturday",
  "pickem_saturday",
  "survivor_friday_reminder",
];

export type JobOutcome =
  | "sent"
  | "failed"
  | "skipped_duplicate"
  | "not_due"
  | "no_current_week";

export type JobResult = {
  jobType: WeeklyJobType;
  outcome: JobOutcome;
  campaignId?: string;
  recipientCount?: number;
  sentCount?: number;
  skippedCount?: number;
  failedCount?: number;
  error?: string;
};

export type RunOptions = {
  /** Bypass the day-of-week / time-of-day gate (admin "Send now"). */
  force?: boolean;
  /** Restrict to specific jobs; default is all three. */
  only?: WeeklyJobType[];
};

// -- Eastern-time clock -----------------------------------------------------

function easternNow(): { weekday: number; minutesOfDay: number; label: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[get("weekday")] ?? -1;
  const hour = parseInt(get("hour"), 10) || 0;
  const minute = parseInt(get("minute"), 10) || 0;
  return {
    weekday,
    minutesOfDay: hour * 60 + minute,
    label: `${get("weekday")} ${get("hour")}:${get("minute")} ET`,
  };
}

function isJobDue(job: WeeklyJobType, weekday: number, minutesOfDay: number): boolean {
  const SAT = 6;
  const FRI = 5;
  if (job === "survivor_saturday" || job === "pickem_saturday") {
    return weekday === SAT && minutesOfDay >= 12 * 60; // Sat >= 12:00pm ET
  }
  if (job === "survivor_friday_reminder") {
    return weekday === FRI && minutesOfDay >= 18 * 60; // Fri >= 6:00pm ET
  }
  return false;
}

// -- Spread label helpers (mirrors app/actions/pickem.ts) ------------------

function formatSpread(spread: number): string {
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : `${spread}`;
}

function teamSpreadLabel(
  homeTeamId: string,
  teamId: string,
  effectiveSpread: number | null
): string {
  if (effectiveSpread === null) return "";
  const isHome = teamId === homeTeamId;
  const raw = isHome ? effectiveSpread : effectiveSpread === 0 ? 0 : -effectiveSpread;
  return formatSpread(raw);
}

type Supa = ReturnType<typeof createServiceClient>;

type SendTarget = { email: string; html: string; subject: string };

/** Runs a batch of bulk sends and records one email_sends row per recipient. */
async function runSendBatch(
  supabase: Supa,
  campaignId: string,
  subject: string,
  targets: SendTarget[]
): Promise<{ sent: number; skipped: number; failed: number }> {
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const t of targets) {
    const result = await sendEmailWithResult({
      to: t.email,
      subject: t.subject || subject,
      html: t.html,
      stream: "updates",
      unsubscribeCheck: "bulk",
    });

    let status: "sent" | "failed" | "skipped_unsubscribed";
    if (result.ok) {
      status = "sent";
      sent++;
    } else if (result.skipped) {
      status = "skipped_unsubscribed";
      skipped++;
    } else {
      status = "failed";
      failed++;
    }

    await supabase.from("email_sends").insert({
      campaign_id: campaignId,
      recipient_email: t.email,
      status,
      resend_message_id: result.messageId ?? null,
      error: result.ok || result.skipped ? null : result.error ?? "send failed",
    });
  }

  return { sent, skipped, failed };
}

// -- Recipient / content builders -----------------------------------------

type TeamRef = { id: string; school_name: string; short_name: string | null };
const teamName = (t: TeamRef | null | undefined) =>
  t ? t.short_name || t.school_name : "—";

async function buildSurvivorSaturdayTargets(
  supabase: Supa,
  scheduleId: string,
  weekNumber: number
): Promise<{ targets: SendTarget[]; recipientCount: number }> {
  const subject = `2026 SEC Survivor Pool - Week ${weekNumber}`;

  const { data: entryRows } = await supabase
    .from("survivor_entries")
    .select("id, entry_name, entry_number, user_id, status")
    .eq("status", SURVIVOR_ALIVE_STATUS);

  const entries = entryRows ?? [];
  const userIds = [...new Set(entries.map((e) => e.user_id).filter(Boolean))] as string[];

  const { data: profileRows } = userIds.length
    ? await supabase.from("profiles").select("id, email, first_name").in("id", userIds)
    : { data: [] as { id: string; email: string | null; first_name: string | null }[] };
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  const { data: pickRows } = entries.length
    ? await supabase
        .from("survivor_picks")
        .select(
          `entry_id, is_bonus_week,
           team:master_teams!survivor_picks_team_id_fkey(id, school_name, short_name),
           bonus_team:master_teams!survivor_picks_bonus_team_id_fkey(id, school_name, short_name)`
        )
        .eq("schedule_id", scheduleId)
        .in(
          "entry_id",
          entries.map((e) => e.id)
        )
    : { data: [] as unknown[] };

  const pickByEntry = new Map<
    string,
    { team: TeamRef; bonusTeam: TeamRef | null; isBonus: boolean }
  >();
  const dist = new Map<string, number>();
  let distTotal = 0;
  const bonusDist = new Map<string, number>();
  let bonusDistTotal = 0;
  let bonusPickCount = 0;

  for (const raw of (pickRows ?? []) as unknown[]) {
    const p = raw as {
      entry_id: string;
      is_bonus_week: boolean;
      team: TeamRef | null;
      bonus_team: TeamRef | null;
    };
    if (!p.team) continue;
    pickByEntry.set(p.entry_id, {
      team: p.team,
      bonusTeam: p.bonus_team,
      isBonus: p.is_bonus_week,
    });
    const bump = (t: TeamRef) => {
      dist.set(teamName(t), (dist.get(teamName(t)) ?? 0) + 1);
      distTotal++;
    };
    bump(p.team);
    if (p.is_bonus_week) bonusPickCount++;
    if (p.is_bonus_week && p.bonus_team) {
      bump(p.bonus_team);
      bonusDist.set(
        teamName(p.bonus_team),
        (bonusDist.get(teamName(p.bonus_team)) ?? 0) + 1
      );
      bonusDistTotal++;
    }
  }

  const aliveCount = entries.length;
  const totalEntries = entries.length;
  const pickedCount = entries.filter((e) => pickByEntry.has(e.id)).length;

  const teamDistribution: TeamDistributionRow[] = [...dist.entries()]
    .map(([name, count]) => ({
      teamName: name,
      count,
      pct: distTotal > 0 ? (count / distTotal) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const bonusTeamDistribution: TeamDistributionRow[] = [...bonusDist.entries()]
    .map(([name, count]) => ({
      teamName: name,
      count,
      pct: bonusDistTotal > 0 ? (count / bonusDistTotal) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Consolidate by email.
  const groups = new Map<
    string,
    { firstName: string; entries: SurvivorRecapEntry[] }
  >();

  for (const e of entries) {
    const profile = e.user_id ? profileById.get(e.user_id) : null;
    const email = profile?.email?.trim().toLowerCase();
    if (!email) continue;

    const pick = pickByEntry.get(e.id);
    const pickLabel = !pick
      ? "No pick yet"
      : pick.isBonus && pick.bonusTeam
        ? `${teamName(pick.team)} + ${teamName(pick.bonusTeam)} (bonus — both must win)`
        : teamName(pick.team);

    const g: { firstName: string; entries: SurvivorRecapEntry[] } = groups.get(email) ?? {
      firstName: (profile?.first_name || "there").trim(),
      entries: [],
    };
    g.entries.push({
      entryName: e.entry_name || `Entry ${e.entry_number}`,
      pickLabel,
    });
    groups.set(email, g);
  }

  const targets: SendTarget[] = [...groups.entries()].map(([email, g]) => ({
    email,
    subject,
    html: survivorSaturdayRecapEmail({
      firstName: g.firstName,
      weekNumber,
      entries: g.entries,
      pickedCount,
      aliveCount,
      totalEntries,
      bonusPickCount,
      teamDistribution,
      bonusTeamDistribution,
      viewPicksUrl: `${SITE_URL}/survivor`,
      unsubscribeUrl: unsubscribeUrl(email),
    }),
  }));

  return { targets, recipientCount: targets.length };
}

type PickemGameJoin = {
  team_id: string;
  entry_id: string;
  game: {
    home_team_id: string;
    away_team_id: string;
    kickoff_time: string;
    home_spread: number | null;
    pickem_spread_override: number | null;
    home_team: TeamRef;
    away_team: TeamRef;
  };
};

async function buildPickemSaturdayTargets(
  supabase: Supa,
  scheduleId: string,
  weekNumber: number
): Promise<{ targets: SendTarget[]; recipientCount: number }> {
  const subject = `Week ${weekNumber} College Football Pickem Pool`;

  const { data: entryRows } = await supabase
    .from("pickem_entries")
    .select("id, entry_name, entrant_email")
    .eq("schedule_id", scheduleId);
  const entries = entryRows ?? [];

  const { data: ecountRow } = await supabase
    .from("pickem_week_ecount")
    .select("ecount")
    .eq("schedule_id", scheduleId)
    .maybeSingle();
  const ecount = ecountRow?.ecount ?? 0;

  const { data: pickRows } = entries.length
    ? await supabase
        .from("pickem_picks")
        .select(
          `team_id, entry_id,
           game:games!inner(home_team_id, away_team_id, kickoff_time, home_spread, pickem_spread_override,
             home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name),
             away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name))`
        )
        .in(
          "entry_id",
          entries.map((e) => e.id)
        )
    : { data: [] as unknown[] };

  const picksByEntry = new Map<string, PickemRecapPick[]>();
  const now = Date.now();
  for (const raw of (pickRows ?? []) as unknown[]) {
    const row = raw as PickemGameJoin;
    const g = row.game;
    const isHome = row.team_id === g.home_team_id;
    const team = isHome ? g.home_team : g.away_team;
    const opp = isHome ? g.away_team : g.home_team;
    const effectiveSpread = g.pickem_spread_override ?? g.home_spread;
    const arr = picksByEntry.get(row.entry_id) ?? [];
    arr.push({
      gameLabel: isHome
        ? `${teamName(opp)} @ ${teamName(team)}`
        : `${teamName(team)} @ ${teamName(opp)}`,
      teamName: teamName(team),
      spreadLabel: teamSpreadLabel(g.home_team_id, row.team_id, effectiveSpread),
      locked: new Date(g.kickoff_time).getTime() <= now,
    });
    picksByEntry.set(row.entry_id, arr);
  }

  // First-name lookup by email (many pickem entries have no user_id).
  const emails = [
    ...new Set(
      entries
        .map((e) => e.entrant_email?.trim().toLowerCase())
        .filter(Boolean) as string[]
    ),
  ];
  const { data: profileRows } = emails.length
    ? await supabase.from("profiles").select("email, first_name").in("email", emails)
    : { data: [] as { email: string | null; first_name: string | null }[] };
  const firstNameByEmail = new Map(
    (profileRows ?? [])
      .filter((p) => p.email)
      .map((p) => [p.email!.trim().toLowerCase(), (p.first_name || "").trim()])
  );

  const groups = new Map<string, PickemRecapEntry[]>();
  for (const e of entries) {
    const email = e.entrant_email?.trim().toLowerCase();
    if (!email) continue;
    const arr = groups.get(email) ?? [];
    arr.push({
      entryName: e.entry_name,
      picks: (picksByEntry.get(e.id) ?? []).slice().sort((a, b) => Number(a.locked) - Number(b.locked)),
    });
    groups.set(email, arr);
  }

  const targets: SendTarget[] = [...groups.entries()].map(([email, entryList]) => ({
    email,
    subject,
    html: pickemSaturdayRecapEmail({
      firstName: firstNameByEmail.get(email) || "there",
      weekNumber,
      entries: entryList,
      ecount,
      leaderboardUrl: `${SITE_URL}/pickem/leaderboard`,
      unsubscribeUrl: unsubscribeUrl(email),
    }),
  }));

  return { targets, recipientCount: targets.length };
}

async function buildSurvivorFridayReminderTargets(
  supabase: Supa,
  scheduleId: string,
  weekNumber: number
): Promise<{ targets: SendTarget[]; recipientCount: number }> {
  const subject = `2026 SEC Survivor Pool: Missing Week ${weekNumber} Pick`;

  const { data: entryRows } = await supabase
    .from("survivor_entries")
    .select("id, entry_name, entry_number, user_id")
    .eq("status", SURVIVOR_ALIVE_STATUS);
  const entries = entryRows ?? [];

  const { data: pickRows } = entries.length
    ? await supabase
        .from("survivor_picks")
        .select("entry_id")
        .eq("schedule_id", scheduleId)
        .in(
          "entry_id",
          entries.map((e) => e.id)
        )
    : { data: [] as { entry_id: string }[] };
  const hasPick = new Set((pickRows ?? []).map((p) => p.entry_id));

  const missing = entries.filter((e) => !hasPick.has(e.id));
  const userIds = [...new Set(missing.map((e) => e.user_id).filter(Boolean))] as string[];
  const { data: profileRows } = userIds.length
    ? await supabase.from("profiles").select("id, email, first_name").in("id", userIds)
    : { data: [] as { id: string; email: string | null; first_name: string | null }[] };
  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  // NOT consolidated — one email per missing entry.
  const targets: SendTarget[] = [];
  for (const e of missing) {
    const profile = e.user_id ? profileById.get(e.user_id) : null;
    const email = profile?.email?.trim().toLowerCase();
    if (!email) continue;
    targets.push({
      email,
      subject,
      html: survivorFridayReminderEmail({
        firstName: (profile?.first_name || "there").trim(),
        weekNumber,
        entryName: e.entry_name || `Entry ${e.entry_number}`,
        unsubscribeUrl: unsubscribeUrl(email),
      }),
    });
  }

  return { targets, recipientCount: targets.length };
}

// -- Orchestration --------------------------------------------------------

const SUBJECT_FOR: Record<WeeklyJobType, (week: number) => string> = {
  survivor_saturday: (w) => `2026 SEC Survivor Pool - Week ${w}`,
  pickem_saturday: (w) => `Week ${w} College Football Pickem Pool`,
  survivor_friday_reminder: (w) => `2026 SEC Survivor Pool: Missing Week ${w} Pick`,
};

async function runJob(
  supabase: Supa,
  job: WeeklyJobType,
  scheduleId: string,
  weekNumber: number,
  force: boolean
): Promise<JobResult> {
  // In force mode, clear a prior failed/pending attempt so a manual retry
  // can proceed. A 'sent' or in-flight 'sending' row is left alone.
  if (force) {
    await supabase
      .from("email_campaigns")
      .delete()
      .eq("job_type", job)
      .eq("schedule_id", scheduleId)
      .in("status", ["failed", "pending"]);
  }

  const subject = SUBJECT_FOR[job](weekNumber);

  // Claim via the unique (job_type, schedule_id) constraint.
  const { data: claimed, error: claimError } = await supabase
    .from("email_campaigns")
    .insert({ job_type: job, schedule_id: scheduleId, subject, status: "sending" })
    .select("id")
    .single();

  if (claimError || !claimed) {
    // 23505 = unique violation → already sent / in flight.
    if (claimError && (claimError.code === "23505" || /duplicate key/i.test(claimError.message))) {
      return { jobType: job, outcome: "skipped_duplicate" };
    }
    return {
      jobType: job,
      outcome: "failed",
      error: claimError?.message ?? "claim failed",
    };
  }

  const campaignId = claimed.id as string;

  try {
    const builder =
      job === "survivor_saturday"
        ? buildSurvivorSaturdayTargets
        : job === "pickem_saturday"
          ? buildPickemSaturdayTargets
          : buildSurvivorFridayReminderTargets;

    const { targets, recipientCount } = await builder(supabase, scheduleId, weekNumber);
    const { sent, skipped, failed } = await runSendBatch(
      supabase,
      campaignId,
      subject,
      targets
    );

    await supabase
      .from("email_campaigns")
      .update({
        status: failed > 0 && sent === 0 && skipped === 0 ? "failed" : "sent",
        recipient_count: recipientCount,
        sent_at: new Date().toISOString(),
        error: failed > 0 ? `${failed} send(s) failed` : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", campaignId);

    return {
      jobType: job,
      outcome: failed > 0 && sent === 0 && skipped === 0 ? "failed" : "sent",
      campaignId,
      recipientCount,
      sentCount: sent,
      skippedCount: skipped,
      failedCount: failed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("email_campaigns")
      .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    return { jobType: job, outcome: "failed", campaignId, error: message };
  }
}

export async function runWeeklyEmails(
  opts: RunOptions = {}
): Promise<{ etTime: string; scheduleId: string | null; weekNumber: number | null; results: JobResult[] }> {
  const force = opts.force ?? false;
  const jobs = opts.only && opts.only.length > 0 ? opts.only : ALL_JOBS;

  const { weekday, minutesOfDay, label } = easternNow();

  const supabase = createServiceClient();

  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("current_week_id")
    .single();
  const scheduleId = (appSettings?.current_week_id as string | null) ?? null;

  let weekNumber: number | null = null;
  if (scheduleId) {
    const { data: week } = await supabase
      .from("schedule")
      .select("week_number")
      .eq("id", scheduleId)
      .single();
    weekNumber = (week?.week_number as number | null) ?? null;
  }

  const results: JobResult[] = [];
  for (const job of jobs) {
    if (!force && !isJobDue(job, weekday, minutesOfDay)) {
      results.push({ jobType: job, outcome: "not_due" });
      continue;
    }
    if (!scheduleId || weekNumber === null) {
      results.push({ jobType: job, outcome: "no_current_week" });
      continue;
    }
    results.push(await runJob(supabase, job, scheduleId, weekNumber, force));
  }

  return { etTime: label, scheduleId, weekNumber, results };
}
