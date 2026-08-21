// Every date/time in this app must render in Eastern Time, regardless of
// what timezone the process rendering it happens to run in — Server
// Components run on Vercel's infrastructure (typically UTC), not in Brent's
// browser, so a bare `.toLocaleString()` silently shows UTC instead of ET.
// `timeZone: "America/New_York"` is DST-aware (EDT in season, EST after),
// so no manual DST handling is needed — always route through this file
// rather than calling `.toLocaleString()`/`.toLocaleDateString()`/
// `.toLocaleTimeString()` directly.

const ET_TIME_ZONE = "America/New_York";

function toDate(input: string | Date): Date {
  return typeof input === "string" ? new Date(input) : input;
}

function formatEastern(input: string | Date, options: Intl.DateTimeFormatOptions): string {
  return toDate(input).toLocaleString("en-US", { ...options, timeZone: ET_TIME_ZONE });
}

/** "Sep 5, 2026, 7:00 PM ET" — the default for any standalone point-in-time display (game kickoffs, admin log/audit timestamps, email send times). */
export function formatKickoff(input: string | Date): string {
  return (
    formatEastern(input, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}

/** "9/5/2026" — calendar date only, no time. */
export function formatShortDate(input: string | Date): string {
  return formatEastern(input, { month: "numeric", day: "numeric", year: "numeric" });
}

/** "7:00 PM ET" — time only, no date. */
export function formatTimeOnly(input: string | Date): string {
  return formatEastern(input, { hour: "numeric", minute: "2-digit" }) + " ET";
}

/** "Fri, 7:00 PM ET" — weekday + time, no date (compact schedule strips). */
export function formatWeekdayTime(input: string | Date): string {
  return formatEastern(input, { weekday: "short", hour: "numeric", minute: "2-digit" }) + " ET";
}

/** "Fri, Sep 5, 7:00 PM ET" — weekday + short date + time, no year (schedule rows). */
export function formatScheduleRow(input: string | Date): string {
  return (
    formatEastern(input, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}

/** "Saturday, September 5" — full weekday + long month + day, no year, no time. */
export function formatLongDate(input: string | Date): string {
  return formatEastern(input, { weekday: "long", month: "long", day: "numeric" });
}

/** "Sep 5" — short month + day, no year, no time. */
export function formatMonthDay(input: string | Date): string {
  return formatEastern(input, { month: "short", day: "numeric" });
}

/** "Sep 5, 7:00 PM ET" — short month + day + time, no year (compact deadline callouts). */
export function formatDeadline(input: string | Date): string {
  return (
    formatEastern(input, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) +
    " ET"
  );
}
