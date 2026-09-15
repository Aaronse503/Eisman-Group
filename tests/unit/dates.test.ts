import { describe, expect, it } from 'vitest';
import {
  DATE_PRESETS,
  comparisonRange,
  fmtDate,
  isDueWithin,
  isOverdue,
  resolveRange,
  toDate,
} from '@/lib/dates';
import { nextOccurrence } from '@/lib/domain/tasks';

const NOW = new Date('2026-05-15T12:00:00Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('resolveRange', () => {
  it('covers whole days, inclusive of today', () => {
    const r = resolveRange('last_7', NOW);
    expect(iso(r.from)).toBe('2026-05-09');
    expect(iso(r.to)).toBe('2026-05-15');
  });

  it('gives 30 days for the default preset', () => {
    const r = resolveRange('last_30', NOW);
    expect(iso(r.from)).toBe('2026-04-16');
    expect(iso(r.to)).toBe('2026-05-15');
  });

  it('snaps calendar presets to their boundaries', () => {
    expect(iso(resolveRange('this_month', NOW).from)).toBe('2026-05-01');
    expect(iso(resolveRange('this_month', NOW).to)).toBe('2026-05-31');
    expect(iso(resolveRange('last_month', NOW).from)).toBe('2026-04-01');
    expect(iso(resolveRange('last_month', NOW).to)).toBe('2026-04-30');
    expect(iso(resolveRange('this_quarter', NOW).from)).toBe('2026-04-01');
    expect(iso(resolveRange('this_year', NOW).from)).toBe('2026-01-01');
  });

  it('falls back to last 30 days for an unknown preset', () => {
    const r = resolveRange('nonsense' as never, NOW);
    expect(r.preset).toBe('last_30');
  });

  it('labels every preset', () => {
    for (const preset of DATE_PRESETS) {
      expect(resolveRange(preset.value, NOW).label).toBe(preset.label);
    }
  });

  it('never returns a range that ends before it starts', () => {
    for (const preset of DATE_PRESETS) {
      const r = resolveRange(preset.value, NOW);
      expect(r.to.getTime()).toBeGreaterThan(r.from.getTime());
    }
  });
});

describe('comparisonRange', () => {
  it('uses the immediately preceding window of the same length', () => {
    const c = comparisonRange(resolveRange('last_30', NOW));
    expect(iso(c.from)).toBe('2026-03-17');
    expect(iso(c.to)).toBe('2026-04-15');
    expect(c.label).toBe('Previous 30 days');
  });

  it('compares calendar months with the previous calendar month', () => {
    const c = comparisonRange(resolveRange('this_month', NOW));
    expect(iso(c.from)).toBe('2026-04-01');
    expect(iso(c.to)).toBe('2026-04-30');
    expect(c.label).toBe('Previous month');
  });

  it('compares a quarter with the previous quarter and a year with the previous year', () => {
    expect(iso(comparisonRange(resolveRange('this_quarter', NOW)).from)).toBe('2026-01-01');
    expect(iso(comparisonRange(resolveRange('this_year', NOW)).from)).toBe('2025-01-01');
  });

  it('never overlaps the range it is compared with', () => {
    for (const preset of DATE_PRESETS) {
      const r = resolveRange(preset.value, NOW);
      const c = comparisonRange(r);
      expect(c.to.getTime()).toBeLessThanOrEqual(r.from.getTime());
    }
  });
});

describe('due dates', () => {
  it('treats a past date with no completion as overdue', () => {
    expect(isOverdue('2020-01-01T00:00:00Z')).toBe(true);
  });

  it('does not treat a completed task as overdue', () => {
    expect(isOverdue('2020-01-01T00:00:00Z', new Date('2020-01-02T00:00:00Z'))).toBe(false);
  });

  it('treats a task with no due date as not overdue', () => {
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue(undefined)).toBe(false);
  });

  it('checks a forward window only', () => {
    const inFiveDays = new Date(Date.now() + 5 * 86400_000);
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400_000);
    expect(isDueWithin(inFiveDays, 7)).toBe(true);
    expect(isDueWithin(inFiveDays, 2)).toBe(false);
    expect(isDueWithin(fiveDaysAgo, 7)).toBe(false);
  });
});

describe('toDate and formatting', () => {
  it('parses strings and passes Dates through', () => {
    expect(toDate('2026-05-15T00:00:00Z')?.getUTCFullYear()).toBe(2026);
    expect(toDate(NOW)).toEqual(NOW);
  });

  it('returns null for empty or unparseable input rather than Invalid Date', () => {
    expect(toDate(null)).toBe(null);
    expect(toDate(undefined)).toBe(null);
    expect(toDate('')).toBe(null);
    expect(toDate('not a date')).toBe(null);
  });

  it('renders an em dash for a missing date instead of "Invalid Date"', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('nonsense')).toBe('—');
  });
});

describe('nextOccurrence', () => {
  const at = (s: string) => new Date(`${s}T09:00:00Z`);
  const day = (d: Date | null) => d?.toISOString().slice(0, 10);

  it('advances daily and weekly rules', () => {
    expect(day(nextOccurrence('FREQ=DAILY', at('2026-05-15')))).toBe('2026-05-16');
    expect(day(nextOccurrence('FREQ=WEEKLY', at('2026-05-15')))).toBe('2026-05-22');
  });

  it('honours an interval', () => {
    expect(day(nextOccurrence('FREQ=DAILY;INTERVAL=3', at('2026-05-15')))).toBe('2026-05-18');
    expect(day(nextOccurrence('FREQ=WEEKLY;INTERVAL=2', at('2026-05-15')))).toBe('2026-05-29');
    expect(day(nextOccurrence('FREQ=MONTHLY;INTERVAL=3', at('2026-05-15')))).toBe('2026-08-15');
  });

  it('steps a weekday rule to the next weekday, not a week later', () => {
    // 2026-05-15 is a Friday; the next weekday is Monday the 18th.
    expect(day(nextOccurrence('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', at('2026-05-15')))).toBe(
      '2026-05-18',
    );
    // Tuesday to Wednesday.
    expect(day(nextOccurrence('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', at('2026-05-19')))).toBe(
      '2026-05-20',
    );
  });

  it('clamps a monthly rule to the end of a short month', () => {
    expect(day(nextOccurrence('FREQ=MONTHLY', at('2026-01-31')))).toBe('2026-02-28');
    expect(day(nextOccurrence('FREQ=MONTHLY', at('2026-03-31')))).toBe('2026-04-30');
  });

  it('handles a leap day yearly rule', () => {
    expect(day(nextOccurrence('FREQ=YEARLY', at('2028-02-29')))).toBe('2029-02-28');
    expect(day(nextOccurrence('FREQ=YEARLY', at('2026-05-15')))).toBe('2027-05-15');
  });

  it('keeps the time of day', () => {
    expect(nextOccurrence('FREQ=DAILY', at('2026-05-15'))?.toISOString()).toBe(
      '2026-05-16T09:00:00.000Z',
    );
  });

  it('returns null for a rule it does not understand, rather than a wrong date', () => {
    expect(nextOccurrence('FREQ=FORTNIGHTLY', at('2026-05-15'))).toBe(null);
    expect(nextOccurrence('', at('2026-05-15'))).toBe(null);
    expect(nextOccurrence('FREQ=DAILY', new Date('nonsense'))).toBe(null);
  });
});
