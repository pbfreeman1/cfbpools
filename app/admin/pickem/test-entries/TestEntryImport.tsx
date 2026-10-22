"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv, toCsv } from "@/lib/csv";
import {
  importPickemTestEntries,
  type PickemTestImportError,
} from "@/app/actions/admin-pickem-test";

// The RPC enforces this too (`Too many rows (max 200 per upload)`); checked
// client-side as well so an oversized file fails before a round trip.
const MAX_ROWS = 200;

// A Pick'em entry is always 6 picks, so the CSV shape is fixed at
// pick_1…pick_6 regardless of how many games are selected for the week.
const PICK_COLUMNS = 6;

export type ImportGame = {
  id: string;
  homeName: string;
  awayName: string;
};

type ParsedRow = { entry_name: string; picks: string[] };

export default function TestEntryImport({
  scheduleId,
  weekLabel,
  games,
}: {
  scheduleId: string;
  weekLabel: string;
  games: ImportGame[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  // Problems found before the RPC is ever called (unreadable file, wrong
  // header, too many rows) — kept separate from the RPC's per-row errors.
  const [parseError, setParseError] = useState<string | null>(null);
  // Per-row problems, from either side: the pick-count check done here on
  // parse, or the import RPC's own validation. Both render in one table.
  const [rowErrors, setRowErrors] = useState<PickemTestImportError[] | null>(null);
  const [rpcMessage, setRpcMessage] = useState<string | null>(null);
  // Set once a dry run comes back clean — gates the Confirm button, and is
  // cleared by any new file selection so a stale clean run can't authorize a
  // different file's import.
  const [dryRunOk, setDryRunOk] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const reset = () => {
    setParsed(null);
    setParseError(null);
    setRowErrors(null);
    setRpcMessage(null);
    setDryRunOk(null);
    setDone(null);
  };

  const downloadTemplate = () => {
    const header = ["entry_name", ...Array.from({ length: PICK_COLUMNS }, (_, i) => `pick_${i + 1}`)];
    // Always 6 example picks, drawn from this week's selected games — cycled
    // if the slate has fewer than 6 games so the template still shows real
    // team names in every column. One row per side of each matchup, so the
    // admin can see that either team is a valid value.
    const example = (pick: (g: ImportGame) => string) =>
      Array.from({ length: PICK_COLUMNS }, (_, i) => pick(games[i % games.length]));
    const rows = [
      ["Test Entry 1", ...example((g) => g.awayName)],
      ["Test Entry 2", ...example((g) => g.homeName)],
    ];
    const blob = new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pickem-test-entries-${weekLabel.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File) => {
    reset();
    setFileName(file.name);

    let text: string;
    try {
      text = await file.text();
    } catch {
      setParseError("Couldn't read that file.");
      return;
    }

    const { header, rows } = parseCsv(text);
    if (header.length === 0) {
      setParseError("That file is empty.");
      return;
    }
    if (header[0] !== "entry_name") {
      setParseError(
        `The first column must be "entry_name" (found "${header[0] || "—"}"). Download the template below.`
      );
      return;
    }

    if (rows.length === 0) {
      setParseError("That file has a header row but no entries.");
      return;
    }
    if (rows.length > MAX_ROWS) {
      setParseError(`That file has ${rows.length} rows — the limit is ${MAX_ROWS} per upload.`);
      return;
    }

    // Every pick_N column in the header is read, in header order — the
    // import RPC matches picks to games by team name, not by column
    // position, so the only thing that matters is landing on exactly 6
    // non-empty picks. Blank cells are dropped rather than sent as empty
    // strings, which is what makes a short row fail the count below.
    const pickIdx = header
      .map((h, i) => (/^pick_\d+$/.test(h) ? i : -1))
      .filter((i) => i >= 0);
    const nameIdx = header.indexOf("entry_name");

    const candidates: ParsedRow[] = rows.map((r) => ({
      entry_name: (r[nameIdx] ?? "").trim(),
      picks: pickIdx.map((i) => (r[i] ?? "").trim()).filter((v) => v !== ""),
    }));

    const countErrors: PickemTestImportError[] = candidates
      .map((row, i) =>
        row.picks.length === PICK_COLUMNS
          ? null
          : { row: i + 1, entry_name: row.entry_name, error: `Expected exactly ${PICK_COLUMNS} picks` }
      )
      .filter((e): e is PickemTestImportError => e !== null);

    if (countErrors.length > 0) {
      setRowErrors(countErrors);
      return;
    }

    setParsed(candidates);
  };

  const runDryRun = async () => {
    if (!parsed) return;
    setBusy(true);
    setRowErrors(null);
    setRpcMessage(null);
    setDryRunOk(null);
    const res = await importPickemTestEntries(scheduleId, parsed, true);
    setBusy(false);

    if (!res.ok) {
      if (res.errors?.length) setRowErrors(res.errors);
      else setRpcMessage(res.message ?? "Validation failed.");
      return;
    }
    setDryRunOk(res.valid_rows ?? parsed.length);
  };

  const runImport = async () => {
    if (!parsed || dryRunOk === null) return;
    setBusy(true);
    setRowErrors(null);
    setRpcMessage(null);
    const res = await importPickemTestEntries(scheduleId, parsed, false);
    setBusy(false);

    if (!res.ok) {
      if (res.errors?.length) setRowErrors(res.errors);
      else setRpcMessage(res.message ?? "Import failed.");
      setDryRunOk(null);
      return;
    }

    setDone(
      `Imported ${res.inserted ?? 0} test ${res.inserted === 1 ? "entry" : "entries"}.`
    );
    setParsed(null);
    setDryRunOk(null);
    setFileName(null);
    if (fileInput.current) fileInput.current.value = "";
    // The records list below is server-rendered on first load — refresh it so
    // the new entries appear without a manual reload.
    router.refresh();
  };

  return (
    <div className="mb-10 rounded-lg border border-edge bg-surface p-4">
      <h2 className="mb-1 font-display text-lg font-semibold uppercase tracking-wide text-ink">
        Upload test entries
      </h2>
      <p className="mb-3 text-xs text-muted">
        CSV with a header row: <span className="font-data">entry_name</span>, then{" "}
        <span className="font-data">pick_1</span>…
        <span className="font-data">pick_{PICK_COLUMNS}</span> — exactly {PICK_COLUMNS} team names
        (full or short) per row, drawn from this week&apos;s selected games, in any order. Max{" "}
        {MAX_ROWS} rows. Test entries never count toward eCount or shift row numbers, and have no
        email address.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
          className="text-sm text-ink file:mr-3 file:rounded-md file:border file:border-edge file:bg-app file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-hover"
        />
        <button
          type="button"
          onClick={downloadTemplate}
          disabled={games.length === 0}
          className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download template
        </button>
      </div>

      {done && <p className="mb-3 rounded-md bg-alive/10 px-3 py-2 text-sm text-alive">{done}</p>}

      {parseError && (
        <p className="mb-3 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{parseError}</p>
      )}
      {rpcMessage && (
        <p className="mb-3 rounded-md bg-dead/10 px-3 py-2 text-sm text-dead">{rpcMessage}</p>
      )}

      {rowErrors && rowErrors.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-sm font-medium text-dead">
            {rowErrors.length} row{rowErrors.length === 1 ? "" : "s"} rejected — nothing was
            imported. Fix the file and upload again.
          </p>
          <div className="divide-y divide-edge overflow-hidden rounded-md border border-dead/40">
            <div className="grid grid-cols-[4rem_1fr_2fr] gap-2 bg-dead/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <span>Row</span>
              <span>Entry name</span>
              <span>Problem</span>
            </div>
            {rowErrors.map((e, i) => (
              <div
                key={`${e.row}-${i}`}
                className="grid grid-cols-[4rem_1fr_2fr] gap-2 px-3 py-1.5 text-sm"
              >
                <span className="font-data text-muted">{e.row}</span>
                <span className="truncate text-ink">{e.entry_name || "—"}</span>
                <span className="text-dead">{e.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {parsed && (
        <div className="mb-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink">
              <span className="font-medium">{fileName}</span> — {parsed.length} row
              {parsed.length === 1 ? "" : "s"} parsed
              {dryRunOk !== null && (
                <span className="ml-1 text-alive">· {dryRunOk} valid, ready to import</span>
              )}
            </p>
            <div className="flex gap-2">
              {dryRunOk === null ? (
                <button
                  type="button"
                  onClick={runDryRun}
                  disabled={busy}
                  className="rounded-md bg-gold-500 px-4 py-1.5 text-sm font-semibold text-app transition hover:bg-gold-600 disabled:opacity-60"
                >
                  {busy ? "Validating…" : "Validate (dry run)"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={runImport}
                  disabled={busy}
                  className="rounded-md bg-alive px-4 py-1.5 text-sm font-semibold text-app transition hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? "Importing…" : `Confirm import (${dryRunOk})`}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  reset();
                  setFileName(null);
                  if (fileInput.current) fileInput.current.value = "";
                }}
                disabled={busy}
                className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-hover"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-edge">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-app text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-1.5 text-left">#</th>
                  <th className="px-3 py-1.5 text-left">Entry name</th>
                  {Array.from({ length: PICK_COLUMNS }, (_, i) => (
                    <th key={i} className="px-3 py-1.5 text-left">
                      Pick {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {parsed.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-data text-xs text-muted">{i + 1}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-ink">{r.entry_name || "—"}</td>
                    {Array.from({ length: PICK_COLUMNS }, (_, c) => (
                      <td key={c} className="whitespace-nowrap px-3 py-1.5 text-muted">
                        {r.picks[c] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
