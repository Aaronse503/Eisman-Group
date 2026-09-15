import { sql } from '@/lib/db/client';

/** Deterministic PRNG so every seed run produces the same demo dataset. */
export function makeRandom(seed = 20260915) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    },
    int(min: number, max: number) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(this.next() * items.length)]!;
    },
    picks<T>(items: readonly T[], count: number): T[] {
      const pool = [...items];
      const out: T[] = [];
      for (let i = 0; i < count && pool.length; i++) {
        out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]!);
      }
      return out;
    },
    bool(probability = 0.5) {
      return this.next() < probability;
    },
    money(min: number, max: number, step = 50) {
      return Math.round((this.next() * (max - min) + min) / step) * step;
    },
    /** A date `daysAgo` in the past (negative = future), with a random time. */
    date(daysAgoMin: number, daysAgoMax: number) {
      const days = this.int(Math.min(daysAgoMin, daysAgoMax), Math.max(daysAgoMin, daysAgoMax));
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - days);
      d.setUTCHours(this.int(13, 23), this.int(0, 59), 0, 0);
      return d;
    },
  };
}

export type Random = ReturnType<typeof makeRandom>;

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Batched multi-row INSERT. Returns the generated ids in row order so the
 * seed can wire up foreign keys without a round trip per row.
 */
export async function insertMany(
  table: string,
  columns: readonly string[],
  rows: readonly unknown[][],
  chunkSize = 200,
  /** e.g. 'do nothing' — makes a configuration seed safe to re-run. */
  onConflict?: string,
): Promise<string[]> {
  if (!rows.length) return [];
  const ids: string[] = [];
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const params: unknown[] = [];
    const values = chunk
      .map(
        (row) =>
          `(${row
            .map((value) => {
              params.push(value);
              return `$${params.length}`;
            })
            .join(',')})`,
      )
      .join(',');
    const returned = await sql<{ id: string }>(
      `insert into ${table} (${columns.join(',')}) values ${values}` +
        (onConflict ? ` on conflict ${onConflict}` : '') +
        ` returning id`,
      params,
    );
    ids.push(...returned.map((r) => r.id));
  }
  return ids;
}
