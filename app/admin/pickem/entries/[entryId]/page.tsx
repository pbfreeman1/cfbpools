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

type AuditEvent = { at: string; label: string; detail: string };

export default async function AdminPickemEntryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; schedule_id?: string }>;
}) {
  const { entryId } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  // Preserve the week filter the admin arrived with (item 5) on the back link.
  const entriesHref = query.schedule_id
    ? `/admin/pickem/entries?schedule_id=${encodeURIComponent(query.schedule_id)}`
    : "/admin/pickem/entries";

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
        <Link href={entriesHref} className="mb-4 inline-block text-sm text-gold-400 hover:underline">
          &larr; Entries
        </Link>
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          That entry doesn&apos;t exist.
        </p>
      </div>
    );
  }

  const [{ data: week }, { data: gamesData }, { data: pickRows }, { data: entryLog }, { data: pickLog }] =
    await Promise.all([
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
      supabase
        .from("pickem_entries_log")
        .select("entry_name, version, changed_at")
        .eq("entry_id", entryId)
        .order("version"),
      supabase
        .from("pickem_picks_log")
        .select("game_id, team_id, version, changed_at")
        .eq("entry_id", entryId)
        .order("game_id")
        .order("version"),
    ]);

  const games = (gamesData ?? []) as unknown as GameRow[];
  const pickByGame = new Map((pickRows ?? []).map((p) => [p.game_id, p]));
  const ownerName = [entry.user?.first_name, entry.user?.last_name].filter(Boolean).join(" ");

  // ---- Audit trail (item 4) -------------------------------------------------
  // Built entirely from the two _log tables — no new schema. The trigger
  // re-logs a row on every source-table update, so the grading job (which
  // writes `result` onto each pick) produces version bumps that aren't real
  // edits. We surface a row only when its value actually changed from the
  // prior version for the same key (team_id per game, entry_name for the
  // entry). Admin pick *clears* are deletes — not in pickem_picks_log — so a
  // cleared pick simply stops appearing; those are in the admin action log.
  const logGameIds = new Set<string>((pickLog ?? []).map((r) => r.game_id));
  // A pick's team is always one of its game's two teams, so resolving every
  // referenced game is enough to name both games and teams. Games later
  // de-selected from Pick'em won't be in `games` — fetch those separately.
  const missingGameIds = [...logGameIds].filter((id) => !games.some((g) => g.id === id));
  const { data: extraGames } = missingGameIds.length
    ? await supabase
        .from("games")
        .select(
          `id, home_team:master_teams!games_home_team_id_fkey(id, school_name, short_name),
           away_team:master_teams!games_away_team_id_fkey(id, school_name, short_name)`
        )
        .in("id", missingGameIds)
    : { data: [] };

  const gameLabelById = new Map<string, string>();
  const teamNameById = new Map<string, string>();
  const registerGame = (g: {
    id: string;
    home_team: TeamRef;
    away_team: TeamRef;
  }) => {
    const homeName = g.home_team.short_name || g.home_team.school_name;
    const awayName = g.away_team.short_name || g.away_team.school_name;
    gameLabelById.set(g.id, `${awayName} @ ${homeName}`);
    teamNameById.set(g.home_team.id, homeName);
    teamNameById.set(g.away_team.id, awayName);
  };
  games.forEach((g) => registerGame(g));
  ((extraGames ?? []) as unknown as { id: string; home_team: TeamRef; away_team: TeamRef }[]).forEach(
    (g) => registerGame(g)
  );

  const auditEvents: AuditEvent[] = [];

  let prevEntryName: string | undefined;
  for (const r of (entryLog ?? []).slice().sort((a, b) => a.version - b.version)) {
    if (prevEntryName === undefined) {
      auditEvents.push({ at: r.changed_at, label: "Entry created", detail: `Named “${r.entry_name}”` });
    } else if (r.entry_name !== prevEntryName) {
      auditEvents.push({ at: r.changed_at, label: "Renamed", detail: `→ “${r.entry_name}”` });
    }
    prevEntryName = r.entry_name;
  }

  // pickLog arrives ordered by (game_id, version) — walk each game's rows and
  // only emit when the picked team actually changed.
  const prevPickTeam = new Map<string, string>();
  for (const r of pickLog ?? []) {
    const matchup = gameLabelById.get(r.game_id) ?? "Unknown game";
    const team = teamNameById.get(r.team_id) ?? "Unknown team";
    const prev = prevPickTeam.get(r.game_id);
    if (prev === undefined) {
      auditEvents.push({ at: r.changed_at, label: "Pick made", detail: `${matchup} — ${team}` });
    } else if (prev !== r.team_id) {
      auditEvents.push({ at: r.changed_at, label: "Pick changed", detail: `${matchup} — ${team}` });
    }
    prevPickTeam.set(r.game_id, r.team_id);
  }

  auditEvents.sort((a, b) => a.at.localeCompare(b.at));
  const totalEdits = auditEvents.filter(
    (e) => e.label === "Renamed" || e.label === "Pick changed"
  ).length;

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
            // A game with no pick of its own is blocked once the entry
            // already has 6 picks elsewhere — a game that's already one of
            // those 6 stays interactive so switching/clearing (see item 1a)
            // still works.
            const capBlocksThisGame = !pick && pickByGame.size >= 6;

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
                    disabled={capBlocksThisGame}
                    className={`rounded-md border px-2.5 py-2 text-left text-sm transition ${
                      capBlocksThisGame
                        ? "cursor-not-allowed border-edge opacity-60"
                        : pick?.team_id === game.away_team.id
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
                    disabled={capBlocksThisGame}
                    className={`rounded-md border px-2.5 py-2 text-left text-sm transition ${
                      capBlocksThisGame
                        ? "cursor-not-allowed border-edge opacity-60"
                        : pick?.team_id === game.home_team.id
                          ? "border-gold-500 bg-gold-500/10 font-semibold text-gold-400"
                          : "border-edge text-ink hover:bg-surface-hover"
                    }`}
                  >
                    {homeName}
                    {homeSpread && <span className="ml-1.5 font-data text-xs text-muted">{homeSpread}</span>}
                  </button>
                </div>
                {capBlocksThisGame && (
                  <p className="mt-2 text-xs text-muted">
                    6 picks already made — clear one to add here.
                  </p>
                )}
              </form>
            );
          })}
        </div>
      )}

      <h2 id="audit" className="mb-1 mt-10 scroll-mt-20 font-display text-lg font-semibold uppercase tracking-wide text-ink">
        Audit trail
      </h2>
      <p className="mb-3 text-xs text-muted">
        {totalEdits === 0
          ? "No changes since this entry was created."
          : `${totalEdits} change${totalEdits === 1 ? "" : "s"} since creation.`}{" "}
        Pick clears made by an admin are recorded separately in the admin action log.
      </p>

      {auditEvents.length === 0 ? (
        <p className="text-sm text-muted">Nothing logged for this entry yet.</p>
      ) : (
        <ol className="divide-y divide-edge rounded-lg border border-edge bg-surface">
          {auditEvents.map((e, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2.5">
              <span className="text-sm text-ink">
                <span className="font-medium text-gold-400">{e.label}</span>
                {" — "}
                {e.detail}
              </span>
              <span className="whitespace-nowrap text-xs text-muted">{formatKickoff(e.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
