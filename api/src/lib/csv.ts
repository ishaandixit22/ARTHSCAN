// CSV reading for NSE's report files (quoted fields allowed).

export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field.trim()); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim()); field = "";
      if (row.some((f) => f)) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

/** Rows as objects keyed by the (trimmed) header. */
export function csvObjects(text: string): Record<string, string>[] {
  const [header, ...body] = csvRows(text.replace(/^﻿/, ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

/** "1,234.5" → 1234.5; "", "-", "NA" → null. */
export function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.replace(/,/g, "").trim();
  if (s === "" || s === "-" || s.toUpperCase() === "NA") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
