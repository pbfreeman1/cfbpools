import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatKickoff } from "@/lib/formatDate";
import { renamePickemEntryAdmin, adminSetPickemPick } from "@/app/actions/admin-pickem-entries";

type TeamRef = { id: string; school_name: string; short_name: string | null };

type GameRow = {
  id: string;
  kickoff_time: string;
  venue: string | null;
  home_spread: number | null;
  pickem_spread_override: number | null;
  home_team: TeamRef;
  away_team: TeamRef;
};

function formatSpread(spread: number): string {
  if (spread === 0) return "PK";
  return spread > 0 ? `+${spread}` : `${spread}`;
}

type EntryDetail = {
  id: string;
  entry_name: string;
  entrant_email: string;
  schedule_id: string;
  rownum: number | null;
  is_ecount_eligible: boolean;
  created_at: string;
  user_id: string | null;
  user: { first_name: string | null; last_name: string | null; email: string | null } | null;
};

export default async function AdminPickemEntryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { entryId } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const { data: entryData } = await supabase
    .from("pickem_entries")
    .select(
      `id, entry_name, entrant_email, schedule_id, rownum, is_ecount_eligible, created_at, user_id,
       user:profiles!pickem_entries_user_id_fkey(first_name, last_name, email)`
    )
    .eq("id", entryId)
    .maybeSingle();
  const entry = entryData as unknown as EntryDetail | null;

  if (!entry) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/pickem/entries" className="mb-4 inline-block text-sm text-gold-400 hover:underline">
          &larr; Entries
        </Link>
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          That entry doesn&apos;t exist.
        </p>
      </div>
    );
  }

  const [{ data: week }, { data: gamesData }, { data: pickRows }] = await Promise.all([
    supabase.from("schedule").select("week_number, label").eq("id", entry.schedule_id).single(),
    supabase
      .from("games")
      .select(
        `id, kickoff_time, venue, home_spread, pickem_spread_override,
         home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name),
         away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name)`
      )
      .eq("schedule_id", entry.schedule_id)
      .eq("pickem_selected", true)
      .order("kickoff_time"),
    supabase.from("pickem_picks").select("id, game_id, team_id").eq("entry_id", entryId),
  ]);

  const games = (gamesData ?? []) as unknown as GameRow[];
  const pickByGame = new Map((pickRows ?? []).map((p) => [p.game_id, p]));
  const ownerName = [entry.user?.first_name, entry.user?.last_name].filter(Boolean).join(" ");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/pickem/entries" className="mb-4 inline-block text-sm text-gold-400 hover:underline">
        &larr; Entries
      </Link>
      <h1 className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-gold-400">
        {entry.entry_name}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {ownerName || "—"} ({entry.entrant_email}) — Week {week?.week_number ?? "?"}
        {week?.label ? ` — ${week.label}` : ""} — Row #{entry.rownum ?? "—"} —{" "}
        {entry.is_ecount_eligible ? "eCount eligible" : "eCount excluded"} — Entered{" "}
        {formatKickoff(entry.created_at)}
      </p>

      {query.error && (
        <p className="mb-4 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{query.error}</p>
      )}
      {query.saved && (
        <p className="mb-4 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">Saved.</p>
      )}

      <form
        action={renamePickemEntryAdmin}
        className="mb-8 flex flex-wrap items-end gap-2 rounded-lg border border-edge bg-surface p-4"
      >
        <input type="hidden" name="entryId" value={entryId} />
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
            Entry name
          </label>
          <input
            type="text"
            name="entryName"
            defaultValue={entry.entry_name}
            required
            className="w-full rounded-md border border-edge bg-app px-2 py-1.5 text-sm text-ink"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-gold-500 px-4 py-1.5 text-sm font-semibold text-app transition hover:bg-gold-600"
        >
          Rename
        </button>
      </form>

      <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide text-ink">
        Picks
      </h2>
      <p className="mb-3 text-xs text-muted">
        Click a team to set or change this entry&apos;s pick for that game. Admin overrides bypass
        the normal kickoff lock, so this works even for games already underway.
      </p>

      {games.length === 0 ? (
        <p className="text-sm text-muted">No games in this week&apos;s Pick&apos;em pool.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {games.map((game) => {
            const pick = pickByGame.get(game.id);
            const effectiveSpread = game.pickem_spread_override ?? game.home_spread;
            const homeSpread = effectiveSpread === null ? null : formatSpread(effectiveSpread);
            const awaySpread =
              effectiveSpread === null ? null : formatSpread(effectiveSpread === 0 ? 0 : -effectiveSpread);
            const homeName = game.home_team.short_name || game.home_team.school_name;
            const awayName = game.away_team.short_name || game.away_team.school_name;

            return (
              <form
                key={game.id}
                action={adminSetPickemPick}
                className="rounded-lg border border-edge bg-surface p-3"
              >
                <input type="hidden" name="entryId" value={entryId} />
                <input type="hidden" name="gameId" value={game.id} />
                <input type="hidden" name="pickId" value={pick?.id ?? ""} />
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted">
                  <span>
                    {formatKickoff(game.kickoff_time)}
                    {game.venue ? ` · ${game.venue}` : ""}
                  </span>
                  {!pick && <span className="text-muted">No pick yet</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="submit"
                    name="teamId"
                    value={game.away_team.id}
                    className={`rounded-md border px-2.5 py-2 text-left text-sm transition ${
                      pick?.team_id === game.away_team.id
                        ? "border-gold-500 bg-gold-500/10 font-semibold text-gold-400"
                        : "border-edge text-ink hover:bg-surface-hover"
                    }`}
                  >
                    {awayName}
                    {awaySpread && <span className="ml-1.5 font-data text-xs text-muted">{awaySpread}</span>}
                  </button>
                  <button
                    type="submit"
                    name="teamId"
                    value={game.home_team.id}
                    className={`rounded-md border px-2.5 py-2 text-left text-sm transition ${
                      pick?.team_id === game.home_team.id
                        ? "border-gold-500 bg-gold-500/10 font-semibold text-gold-400"
                        : "border-edge text-ink hover:bg-surface-hover"
                    }`}
                  >
                    {homeName}
                    {homeSpread && <span className="ml-1.5 font-data text-xs text-muted">{homeSpread}</span>}
                  </button>
                </div>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
