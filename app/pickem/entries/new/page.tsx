import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewEntryForm, { type GameOption } from "./NewEntryForm";

type TeamRef = {
  id: string;
  school_name: string;
  short_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
};

type GameRow = {
  id: string;
  kickoff_time: string;
  venue: string | null;
  status: string;
  home_spread: number | null;
  pickem_spread_override: number | null;
  home_team: TeamRef;
  away_team: TeamRef;
};

export default async function NewPickemEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ schedule_id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("current_week_id")
    .single();

  const scheduleId = params.schedule_id || appSettings?.current_week_id || "";

  if (!scheduleId) {
    return (
      <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl">
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          Season schedule not yet loaded.
        </p>
      </main>
    );
  }

  const [{ data: week }, { data: gamesData }, { count: openCount }] = await Promise.all([
    supabase.from("schedule").select("id, season, week_number, label").eq("id", scheduleId).single(),
    supabase
      .from("games")
      .select(
        `id, kickoff_time, venue, status, home_spread, pickem_spread_override,
         home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name, logo_url, primary_color),
         away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name, logo_url, primary_color)`
      )
      .eq("schedule_id", scheduleId)
      .eq("pickem_selected", true)
      .order("kickoff_time"),
    // Mirrors prepare_pickem_entry()'s own "fewer than 6 games remaining
    // closes entry" check exactly — same table, same three filters — so this
    // can never drift from what the DB trigger actually enforces.
    supabase
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("schedule_id", scheduleId)
      .eq("pickem_selected", true)
      .eq("status", "scheduled")
      .gt("kickoff_time", new Date().toISOString()),
  ]);

  if (!week) {
    return (
      <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl">
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          That week could not be found.
        </p>
      </main>
    );
  }

  const closed = (openCount ?? 0) < 6;
  const games = (gamesData ?? []) as unknown as GameRow[];

  const gameOptions: GameOption[] = games.map((g) => ({
    id: g.id,
    kickoffTime: g.kickoff_time,
    venue: g.venue,
    effectiveSpread: g.pickem_spread_override ?? g.home_spread,
    homeTeam: {
      id: g.home_team.id,
      name: g.home_team.short_name || g.home_team.school_name,
      logoUrl: g.home_team.logo_url,
      color: g.home_team.primary_color,
    },
    awayTeam: {
      id: g.away_team.id,
      name: g.away_team.short_name || g.away_team.school_name,
      logoUrl: g.away_team.logo_url,
      color: g.away_team.primary_color,
    },
  }));

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl">
      <Link href="/pickem" className="mb-4 inline-block text-sm text-pickem-400 hover:underline">
        &larr; Pick&apos;em
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-pickem-400">
        New Pick&apos;em Entry
      </h1>
      <p className="mb-6 text-sm text-muted">
        Week {week.week_number}
        {week.label ? ` — ${week.label}` : ""}
      </p>

      {closed ? (
        <div className="rounded-lg border border-dashed border-pickem-500/40 bg-pickem-500/5 px-4 py-4 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-pickem-400">
            Entries closed for Week {week.week_number}
          </p>
          <p className="mt-1 text-xs text-muted">
            Fewer than 6 games remain before kickoff this week. Check back once next week&apos;s
            games are posted.
          </p>
          <Link
            href="/pickem"
            className="mt-3 inline-block text-sm font-medium text-pickem-400 hover:underline"
          >
            Back to Pick&apos;em
          </Link>
        </div>
      ) : (
        <NewEntryForm scheduleId={scheduleId} games={gameOptions} />
      )}
    </main>
  );
}
