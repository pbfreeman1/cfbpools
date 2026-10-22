"use server";

import { requireAdmin } from "@/lib/adminAuth";

// Thin wrappers over the four admin_*_pickem_test_entry/-ies RPCs. These are
// deliberately plain result-returning actions rather than the redirect-style
// admin actions used elsewhere (app/actions/admin-pickem-entries.ts) — the
// Test Entries page is an interactive client surface (two-step dry-run
// import, inline edits, polling) that needs to render the RPC's own error
// text in place, not bounce through ?error= on a server-rendered list.
//
// All four RPCs are admin-gated via is_admin() internally and write their own
// admin_actions rows, so there's no logAdminAction() call here. requireAdmin()
// still runs first so a non-admin gets a redirect instead of a raw
// "Admin only" Postgres exception.

export type PickemTestImportError = {
  row: number;
  entry_name: string;
  error: string;
};

// admin_import_pickem_test_entries returns one of three shapes:
//   validation failed -> { ok: false, dry_run, rows, errors: [...] }
//   clean dry run     -> { ok: true, dry_run: true, valid_rows }
//   real import       -> { ok: true, dry_run: false, inserted, batch_id }
export type PickemTestImportResult = {
  ok: boolean;
  dry_run?: boolean;
  rows?: number;
  valid_rows?: number;
  inserted?: number;
  batch_id?: string;
  errors?: PickemTestImportError[];
  // Set only when the RPC itself raised (bad schedule, >200 rows, no games
  // selected this week, etc.) rather than returning a per-row error list.
  message?: string;
};

export type PickemTestPick = {
  game_id: string;
  kickoff_time: string;
  game_status: string;
  team_id: string;
  team_name: string;
  home_team: string;
  away_team: string;
  spread: number | null;
  home_score: number | null;
  away_score: number | null;
  result: "win" | "loss" | "push" | null;
  live_result: "win" | "loss" | "push" | null;
};

export type PickemTestEntry = {
  entry_id: string;
  entry_name: string;
  batch_id: string | null;
  created_at: string;
  wins: number;
  losses: number;
  pushes: number;
  effective_losses: number;
  pending: number;
  live_wins: number;
  live_losses: number;
  is_alive: boolean;
  is_alive_live: boolean;
  picks: PickemTestPick[];
};

export async function importPickemTestEntries(
  scheduleId: string,
  rows: { entry_name: string; picks: string[] }[],
  dryRun: boolean
): Promise<PickemTestImportResult> {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_import_pickem_test_entries", {
    p_schedule_id: scheduleId,
    p_rows: rows,
    p_dry_run: dryRun,
  });

  if (error) return { ok: false, message: error.message };
  return data as PickemTestImportResult;
}

// Returns null (rather than []) on failure so the polling caller can tell a
// transient error apart from "this week genuinely has no test entries" and
// keep showing the last good data — same convention as
// getPickemLeaderboard() in app/actions/pickem.ts.
export async function getPickemTestEntries(
  scheduleId: string
): Promise<PickemTestEntry[] | null> {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_get_pickem_test_entries", {
    p_schedule_id: scheduleId,
  });

  if (error || !data) return null;
  return data as PickemTestEntry[];
}

export async function updatePickemTestEntry(
  entryId: string,
  entryName: string | null,
  picks: { game_id: string; team_id: string }[] | null
): Promise<{ ok: boolean; message?: string }> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase.rpc("admin_update_pickem_test_entry", {
    p_entry_id: entryId,
    p_entry_name: entryName,
    p_picks: picks,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function deletePickemTestEntries(
  entryIds: string[]
): Promise<{ ok: boolean; deleted?: number; message?: string }> {
  const { supabase } = await requireAdmin();

  if (entryIds.length === 0) return { ok: true, deleted: 0 };

  const { data, error } = await supabase.rpc("admin_delete_pickem_test_entries", {
    p_entry_ids: entryIds,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, deleted: (data as number) ?? 0 };
}
