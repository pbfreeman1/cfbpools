// Minimal RFC 4180-ish CSV reader for admin file uploads.
//
// Deliberately not a dependency (papaparse et al.): the only CSV this app
// ingests is the Pick'em test-entry template — a header row plus short
// single-line records of team names — so the whole surface is quoted fields,
// escaped double-quotes, and CRLF. Handling those three in ~40 lines beats
// adding a package for it. If a future import needs embedded newlines inside
// quoted fields, streaming, or type coercion, swap this for a real parser
// rather than growing it.

/** Splits one CSV line into fields, honoring "quoted, fields" and "" escapes. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/**
 * Parses CSV text into a header array plus data rows. Blank lines (including
 * all-empty-field lines, which is what trailing newlines and Excel exports
 * produce) are dropped. Every value is trimmed.
 */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text
    .replace(/^﻿/, "") // strip a UTF-8 BOM (Excel adds one)
    .split(/\r\n|\n|\r/);

  const parsed = lines
    .map((l) => splitLine(l))
    .filter((fields) => fields.some((f) => f !== ""));

  if (parsed.length === 0) return { header: [], rows: [] };
  return { header: parsed[0].map((h) => h.toLowerCase()), rows: parsed.slice(1) };
}

/** Builds a CSV text body from a header row plus data rows, quoting as needed. */
export function toCsv(header: string[], rows: string[][]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
