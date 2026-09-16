/** Tiny CSV helpers usable in the browser (no Node APIs). */

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Guard against spreadsheet formula injection in exported files.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export function objectsToCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns?: readonly (keyof T & string)[],
): string {
  const keys = columns ?? (rows.length ? (Object.keys(rows[0]!) as (keyof T & string)[]) : []);
  return toCsv([keys, ...rows.map((r) => keys.map((k) => r[k]))]);
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
