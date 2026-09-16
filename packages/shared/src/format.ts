/**
 * Formatting shared by both applications, so a number reads the same on a
 * laptop and on a phone.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  currency = 'USD',
  opts: { compact?: boolean; decimals?: number } = {},
) {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.decimals ?? (opts.compact ? 1 : n % 1 === 0 ? 0 : 2),
    minimumFractionDigits: 0,
  }).format(n);
}

export function formatNumber(value: number | string | null | undefined, opts: { compact?: boolean } = {}) {
  const n = typeof value === 'string' ? Number.parseFloat(value) : (value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : 0,
  }).format(n);
}

export function formatPercent(value: number | null | undefined, decimals = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '' : ''}${value.toFixed(decimals)}%`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function truncate(value: string, max = 120) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Percentage change from `previous` to `current`; null when there is no base. */
export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function uniq<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function groupBy<T, K extends string | number>(items: readonly T[], key: (item: T) => K) {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

export function sum<T>(items: readonly T[], value: (item: T) => number): number {
  return items.reduce((acc, item) => acc + (Number(value(item)) || 0), 0);
}
