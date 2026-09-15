import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  formatDistanceToNowStrict,
  isAfter,
  isBefore,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subQuarters,
  subYears,
} from 'date-fns';

export type DateRangePreset =
  | 'last_7'
  | 'last_30'
  | 'last_90'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'all_time';

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
  preset: DateRangePreset;
}

export const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_year', label: 'This year' },
  { value: 'all_time', label: 'All time' },
];

export function resolveRange(preset: DateRangePreset, now = new Date()): DateRange {
  const label = DATE_PRESETS.find((p) => p.value === preset)?.label ?? 'Last 30 days';
  switch (preset) {
    case 'last_7':
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), label, preset };
    case 'last_90':
      return { from: startOfDay(subDays(now, 89)), to: endOfDay(now), label, preset };
    case 'this_month':
      return { from: startOfMonth(now), to: endOfMonth(now), label, preset };
    case 'last_month': {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev), label, preset };
    }
    case 'this_quarter':
      return { from: startOfQuarter(now), to: endOfQuarter(now), label, preset };
    case 'this_year':
      return { from: startOfYear(now), to: endOfYear(now), label, preset };
    case 'all_time':
      return { from: new Date('2015-01-01T00:00:00Z'), to: endOfDay(now), label, preset };
    case 'last_30':
    default:
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now), label, preset: 'last_30' };
  }
}

/** The immediately preceding, equal-length window — used for comparisons. */
export function comparisonRange(range: DateRange): DateRange {
  const days = Math.max(differenceInCalendarDays(range.to, range.from) + 1, 1);
  switch (range.preset) {
    case 'this_month':
    case 'last_month':
      return {
        from: startOfMonth(subMonths(range.from, 1)),
        to: endOfMonth(subMonths(range.from, 1)),
        label: 'Previous month',
        preset: range.preset,
      };
    case 'this_quarter':
      return {
        from: startOfQuarter(subQuarters(range.from, 1)),
        to: endOfQuarter(subQuarters(range.from, 1)),
        label: 'Previous quarter',
        preset: range.preset,
      };
    case 'this_year':
      return {
        from: startOfYear(subYears(range.from, 1)),
        to: endOfYear(subYears(range.from, 1)),
        label: 'Previous year',
        preset: range.preset,
      };
    default:
      return {
        from: startOfDay(subDays(range.from, days)),
        to: endOfDay(subDays(range.to, days)),
        label: `Previous ${days} days`,
        preset: range.preset,
      };
  }
}

export function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : parseISO(value);
  return isValid(d) ? d : null;
}

export function fmtDate(value: Date | string | null | undefined, pattern = 'MMM d, yyyy') {
  const d = toDate(value);
  return d ? format(d, pattern) : '—';
}

export function fmtDateTime(value: Date | string | null | undefined) {
  const d = toDate(value);
  return d ? format(d, "MMM d, yyyy 'at' h:mm a") : '—';
}

export function fmtTime(value: Date | string | null | undefined) {
  const d = toDate(value);
  return d ? format(d, 'h:mm a') : '—';
}

export function fmtRelative(value: Date | string | null | undefined) {
  const d = toDate(value);
  if (!d) return '—';
  const diff = Math.abs(Date.now() - d.getTime());
  if (diff < 45_000) return 'just now';
  return `${formatDistanceToNowStrict(d)}${d.getTime() < Date.now() ? ' ago' : ' from now'}`;
}

export function isOverdue(due: Date | string | null | undefined, completed?: Date | null) {
  if (completed) return false;
  const d = toDate(due);
  return d ? isBefore(d, new Date()) : false;
}

export function isDueWithin(due: Date | string | null | undefined, days: number) {
  const d = toDate(due);
  if (!d) return false;
  const now = new Date();
  return !isBefore(d, startOfDay(now)) && isBefore(d, endOfDay(addDays(now, days)));
}

export { addDays, endOfDay, endOfWeek, isAfter, isBefore, startOfDay, startOfWeek, subDays };
