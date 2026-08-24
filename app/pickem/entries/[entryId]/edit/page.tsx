import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditEntryForm, { type ExistingPick, type GameOption } from "./EditEntryForm";

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
  home_spread: number | null;
  pickem_spread_override: number | null;
  home_team: TeamRef;
  away_team: TeamRef;
};

export default async function EditPickemEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entry } = await supabase
    .from("pickem_entries")
    .select("id, entry_name, schedule_id, user_id")
    .eq("id", entryId)
    .maybeSingle();

  if (!entry) {
    return (
      <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl">
        <Link href="/pickem" className="mb-4 inline-block text-sm text-pickem-400 hover:underline">
          &larr; Pick&apos;em
        </Link>
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          That entry doesn&apos;t exist.
        </p>
      </main>
    );
  }

  // pickem_entries has an open SELECT policy (qual: true), so RLS alone
  // won't stop a logged-in user from loading someone else's entry here —
  // this check is the real gate for rendering. Writes to pickem_picks are
  // still independently RLS-enforced (entry.user_id = auth.uid()), but a
  // blank/broken-looking page is a bad way to say "not yours."
  if (entry.user_id !== user.id) {
    return (
      <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl">
        <Link href="/pickem" className="mb-4 inline-block text-sm text-pickem-400 hover:underline">
          &larr; Pick&apos;em
        </Link>
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          This entry isn&apos;t yours to edit.
        </p>
      </main>
    );
  }

  const [{ data: week }, { data: gamesData }, { data: pickRows }] = await Promise.all([
    supabase.from("schedule").select("week_number, label").eq("id", entry.schedule_id).single(),
    supabase
      .from("games")
      .select(
        `id, kickoff_time, venue, home_spread, pickem_spread_override,
         home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name, logo_url, primary_color),
         away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name, logo_url, primary_color)`
      )
      .eq("schedule_id", entry.schedule_id)
      .eq("pickem_selected", true)
      .order("kickoff_time"),
    supabase.from("pickem_picks").select("id, game_id, team_id").eq("entry_id", entryId),
  ]);

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

  const existingPicks: ExistingPick[] = (pickRows ?? []).map((p) => ({
    id: p.id,
    gameId: p.game_id,
    teamId: p.team_id,
  }));

  return (
    <main className="mx-auto min-h-screen max-w-sm px-6 py-12 sm:max-w-xl md:max-w-3xl">
      <Link href="/pickem" className="mb-4 inline-block text-sm text-pickem-400 hover:underline">
        &larr; Pick&apos;em
      </Link>
      <h1 className="mb-1 font-display text-3xl font-bold uppercase tracking-wide text-pickem-400">
        Edit Entry
      </h1>
      <p className="mb-6 text-sm text-muted">
        {entry.entry_name}
        {week ? ` — Week ${week.week_number}${week.label ? ` — ${week.label}` : ""}` : ""}
      </p>

      <EditEntryForm entryId={entryId} games={gameOptions} existingPicks={existingPicks} />
    </main>
  );
}
