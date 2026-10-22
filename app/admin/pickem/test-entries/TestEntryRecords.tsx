"use client";

import { useEffect, useRef, useState } from "react";
import {
  getPickemTestEntries,
  updatePickemTestEntry,
  updatePickemTestEntryName,
  deletePickemTestEntries,
  type PickemTestEntry,
  type PickemTestPick,
} from "@/app/actions/admin-pickem-test";
import { formatKickoff } from "@/lib/formatDate";
import { EntryRecordBadges } from "@/app/pickem/components/EntryRecordBadges";

// Same interval the public leaderboard polls on (app/pickem/leaderboard/
// LeaderboardTable.tsx) — these records move only when the grading function
// runs, so there's no reason for this admin view to refresh faster.
const POLL_MS = 45000;

export type RecordGame = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
};

function resultChip(result: string | null, live: boolean) {
  if (!result) return null;
  const tone =
    result === "win" ? "bg-alive/15 text-alive" : "bg-dead/15 text-dead";
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone} ${
        live ? "italic opacity-80" : ""
      }`}
    >
      {live ? `${result} (live)` : result}
    </span>
  );
}

function PickRow({
  pick,
  game,
  busy,
  onChange,
}: {
  pick: PickemTestPick;
  game: RecordGame | undefined;
  busy: boolean;
  onChange: (gameId: string, teamId: string) => void;
}) {
  const score =
    pick.home_score !== null && pick.away_score !== null
      ? `${pick.away_team} ${pick.away_score} — ${pick.home_team} ${pick.home_score}`
      : null;

  return (
    <div className="grid grid-cols-1 gap-2 px-4 py-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm text-ink">
          {pick.away_team} @ {pick.home_team}
          {pick.spread !== null && (
            <span className="ml-1.5 font-data text-xs text-muted">
              {pick.spread > 0 ? `+${pick.spread}` : pick.spread === 0 ? "PK" : pick.spread}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted">
          {formatKickoff(pick.kickoff_time)} · {pick.game_status}
          {score ? ` · ${score}` : ""}
        </p>
      </div>

      {/* The two-team dropdown needs team *ids*, which the records RPC's
          picks payload doesn't carry — they come from the week's games
          fetched alongside. A pick on a game since de-selected from Pick'em
          won't match, so fall back to a read-only team name. */}
      {game ? (
        <select
          value={pick.team_id}
          disabled={busy}
          onChange={(e) => onChange(pick.game_id, e.target.value)}
          className="rounded-md border border-edge bg-app px-2 py-1 text-sm text-ink disabled:opacity-60"
        >
          <option value={game.awayTeamId}>{game.awayName}</option>
          <option value={game.homeTeamId}>{game.homeName}</option>
        </select>
      ) : (
        <span className="text-sm text-ink">{pick.team_name}</span>
      )}

      <div className="sm:w-24 sm:text-right">
        {resultChip(pick.result, false) ??
          resultChip(pick.live_result, true) ?? (
            <span className="text-xs text-muted">pending</span>
          )}
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  gamesById,
  expanded,
  selected,
  onToggleExpand,
  onToggleSelect,
  onRefresh,
  onError,
}: {
  entry: PickemTestEntry;
  gamesById: Map<string, RecordGame>;
  expanded: boolean;
  selected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onRefresh: () => void;
  onError: (msg: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(entry.entry_name);
  // Entrant name is a separate inline editor from the entry name — they go
  // to different RPCs (admin_update_pickem_test_entry_name vs
  // admin_update_pickem_test_entry), so they get separate edit state.
  const [editingEntrant, setEditingEntrant] = useState(false);
  const [first, setFirst] = useState(entry.first_name ?? "");
  const [last, setLast] = useState(entry.last_name ?? "");
  const [busy, setBusy] = useState(false);

  const entrantName = [entry.first_name, entry.last_name].filter(Boolean).join(" ");

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === entry.entry_name) {
      setRenaming(false);
      setName(entry.entry_name);
      return;
    }
    setBusy(true);
    const res = await updatePickemTestEntry(entry.entry_id, trimmed, null);
    setBusy(false);
    if (!res.ok) {
      onError(res.message ?? "Rename failed.");
      setName(entry.entry_name);
    } else {
      setRenaming(false);
      onRefresh();
    }
  };

  const saveEntrant = async () => {
    const f = first.trim();
    const l = last.trim();
    // The RPC rejects a blank either side; catching it here keeps the editor
    // open with the cursor where it is instead of round-tripping to an error.
    if (!f || !l) {
      onError("First and last name are both required.");
      return;
    }
    if (f === (entry.first_name ?? "") && l === (entry.last_name ?? "")) {
      setEditingEntrant(false);
      return;
    }
    setBusy(true);
    const res = await updatePickemTestEntryName(entry.entry_id, f, l);
    setBusy(false);
    if (!res.ok) {
      onError(res.message ?? "Entrant rename failed.");
      setFirst(entry.first_name ?? "");
      setLast(entry.last_name ?? "");
    } else {
      setEditingEntrant(false);
      onRefresh();
    }
  };

  const changePick = async (gameId: string, teamId: string) => {
    setBusy(true);
    const res = await updatePickemTestEntry(entry.entry_id, null, [
      { game_id: gameId, team_id: teamId },
    ]);
    setBusy(false);
    if (!res.ok) onError(res.message ?? "Pick change failed.");
    onRefresh();
  };

  const remove = async () => {
    if (!confirm(`Delete test entry “${entry.entry_name}”? This can't be undone.`)) return;
    setBusy(true);
    const res = await deletePickemTestEntries([entry.entry_id]);
    setBusy(false);
    if (!res.ok) onError(res.message ?? "Delete failed.");
    onRefresh();
  };

  return (
    <div className="rounded-lg border border-edge bg-surface">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${entry.entry_name}`}
          className="h-4 w-4 flex-shrink-0 accent-gold-500"
        />

        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName();
                  if (e.key === "Escape") {
                    setRenaming(false);
                    setName(entry.entry_name);
                  }
                }}
                autoFocus
                className="w-44 rounded-md border border-edge bg-app px-2 py-1 text-sm text-ink"
              />
              <button
                type="button"
                onClick={() => void saveName()}
                disabled={busy}
                className="rounded-md bg-gold-500 px-2.5 py-1 text-xs font-semibold text-app transition hover:bg-gold-600 disabled:opacity-60"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenaming(false);
                  setName(entry.entry_name);
                }}
                className="text-xs text-muted hover:text-gold-400"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <button
                type="button"
                onClick={() => setRenaming(true)}
                title="Click to rename the entry"
                className="max-w-full truncate text-left text-sm font-medium text-ink hover:text-gold-400"
              >
                {entry.entry_name}
              </button>
              {editingEntrant ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="text"
                    value={first}
                    onChange={(e) => setFirst(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveEntrant();
                      if (e.key === "Escape") {
                        setEditingEntrant(false);
                        setFirst(entry.first_name ?? "");
                        setLast(entry.last_name ?? "");
                      }
                    }}
                    placeholder="First"
                    autoFocus
                    className="w-24 rounded-md border border-edge bg-app px-2 py-0.5 text-xs text-ink"
                  />
                  <input
                    type="text"
                    value={last}
                    onChange={(e) => setLast(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveEntrant();
                      if (e.key === "Escape") {
                        setEditingEntrant(false);
                        setFirst(entry.first_name ?? "");
                        setLast(entry.last_name ?? "");
                      }
                    }}
                    placeholder="Last"
                    className="w-24 rounded-md border border-edge bg-app px-2 py-0.5 text-xs text-ink"
                  />
                  <button
                    type="button"
                    onClick={() => void saveEntrant()}
                    disabled={busy}
                    className="rounded-md bg-gold-500 px-2 py-0.5 text-[11px] font-semibold text-app transition hover:bg-gold-600 disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEntrant(false);
                      setFirst(entry.first_name ?? "");
                      setLast(entry.last_name ?? "");
                    }}
                    className="text-[11px] text-muted hover:text-gold-400"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingEntrant(true)}
                  title="Click to edit the entrant's name"
                  className="truncate text-left text-xs text-muted hover:text-gold-400"
                >
                  {entrantName || "+ add entrant name"}
                </button>
              )}
            </div>
          )}

          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                entry.is_alive_live ? "bg-alive/15 text-alive" : "bg-dead/15 text-dead"
              }`}
            >
              {entry.is_alive_live ? "Alive" : "Eliminated"}
              {entry.is_alive !== entry.is_alive_live && " (live)"}
            </span>
            {entry.is_alive !== entry.is_alive_live && (
              <span className="text-[10px] uppercase tracking-wide text-muted">
                official: {entry.is_alive ? "alive" : "eliminated"}
              </span>
            )}
            {entry.pending > 0 && (
              <span className="text-[10px] uppercase tracking-wide text-muted">
                {entry.pending} pending
              </span>
            )}
          </div>
        </div>

        <EntryRecordBadges
          wins={entry.wins}
          effectiveLosses={entry.effective_losses}
          liveWins={entry.live_wins}
          liveLosses={entry.live_losses}
        />

        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="flex-shrink-0 text-xs font-medium text-dead hover:underline disabled:opacity-60"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse picks" : "Expand picks"}
          className="flex-shrink-0 text-xs text-muted"
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && (
        <div className="divide-y divide-edge border-t border-edge">
          {entry.picks.length === 0 ? (
            <p className="px-4 py-2 text-sm text-muted">No picks on this entry.</p>
          ) : (
            entry.picks.map((p) => (
              <PickRow
                key={p.game_id}
                pick={p}
                game={gamesById.get(p.game_id)}
                busy={busy}
                onChange={changePick}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function TestEntryRecords({
  scheduleId,
  initialEntries,
  games,
}: {
  scheduleId: string;
  initialEntries: PickemTestEntry[];
  games: RecordGame[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const isFetching = useRef(false);

  const gamesById = new Map(games.map((g) => [g.id, g]));

  // A null result means the fetch failed — keep the last good data rather
  // than blanking the list, same as the public leaderboard's polling.
  const refresh = async () => {
    if (isFetching.current) return;
    isFetching.current = true;
    try {
      const next = await getPickemTestEntries(scheduleId);
      if (next === null) {
        setRefreshFailed(true);
      } else {
        setEntries(next);
        setRefreshFailed(false);
        // Drop selections for entries that no longer exist (deleted here or
        // in another tab) so a bulk delete can't carry stale ids.
        setSelected((cur) => {
          const live = new Set(next.map((e) => e.entry_id));
          const kept = new Set([...cur].filter((id) => live.has(id)));
          return kept.size === cur.size ? cur : kept;
        });
      }
    } catch {
      setRefreshFailed(true);
    } finally {
      isFetching.current = false;
    }
  };

  useEffect(() => {
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
    // refresh closes over scheduleId only; re-arming on every render would
    // reset the interval constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId]);

  const allSelected = entries.length > 0 && selected.size === entries.length;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(entries.map((e) => e.entry_id)));

  const bulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} test ${ids.length === 1 ? "entry" : "entries"}? This can't be undone.`
      )
    )
      return;
    setBulkBusy(true);
    const res = await deletePickemTestEntries(ids);
    setBulkBusy(false);
    if (!res.ok) setError(res.message ?? "Bulk delete failed.");
    setSelected(new Set());
    await refresh();
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={entries.length === 0}
              className="h-4 w-4 accent-gold-500"
            />
            Select all
          </label>
          <span className="text-sm font-semibold uppercase tracking-wide text-muted">
            {entries.length} test {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {refreshFailed && <span className="text-xs text-dead">Couldn&apos;t refresh</span>}
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={selected.size === 0 || bulkBusy}
            className="rounded-md border border-dead/50 px-3 py-1.5 text-sm font-medium text-dead transition hover:bg-dead/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {bulkBusy ? "Deleting…" : `Delete selected${selected.size ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 flex items-start justify-between gap-3 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs underline">
            Dismiss
          </button>
        </p>
      )}

      {entries.length === 0 ? (
        <p className="rounded-lg border border-edge bg-surface p-4 text-center text-sm text-muted">
          No test entries for this week yet — upload a CSV above.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <EntryCard
              key={entry.entry_id}
              entry={entry}
              gamesById={gamesById}
              expanded={expandedId === entry.entry_id}
              selected={selected.has(entry.entry_id)}
              onToggleExpand={() =>
                setExpandedId((cur) => (cur === entry.entry_id ? null : entry.entry_id))
              }
              onToggleSelect={() =>
                setSelected((cur) => {
                  const next = new Set(cur);
                  if (next.has(entry.entry_id)) next.delete(entry.entry_id);
                  else next.add(entry.entry_id);
                  return next;
                })
              }
              onRefresh={() => void refresh()}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}
