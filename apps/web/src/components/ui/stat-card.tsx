import * as React from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn, formatPercent } from '@/lib/utils';
import { Tooltip } from './misc';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Percent change vs. the comparison period; null hides the delta. */
  delta?: number | null;
  /** When true a falling number is good (e.g. churn, overdue tasks). */
  invertDelta?: boolean;
  comparisonLabel?: string;
  hint?: React.ReactNode;
  /** Every dashboard card links to the records behind it. */
  href?: string;
  footer?: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  className?: string;
}

export function StatCard({
  label,
  value,
  delta,
  invertDelta,
  comparisonLabel,
  hint,
  href,
  footer,
  tone = 'default',
  className,
}: StatCardProps) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const good = hasDelta ? (invertDelta ? delta! < 0 : delta! > 0) : false;
  const flat = hasDelta && Math.abs(delta!) < 0.05;
  const DeltaIcon = flat ? Minus : delta! > 0 ? ArrowUpRight : ArrowDownRight;

  const body = (
    <div
      className={cn(
        'group flex h-full flex-col gap-2 rounded-[var(--radius-card)] border bg-[var(--surface)] p-3.5 shadow-[var(--shadow-card)] transition-colors sm:p-4',
        tone === 'default' && 'border-[var(--border)]',
        tone === 'warning' && 'border-[var(--warning)]/35',
        tone === 'danger' && 'border-[var(--danger)]/35',
        tone === 'success' && 'border-[var(--success)]/35',
        href && 'hover:border-[var(--accent)]/45',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
          {label}
        </p>
        {href ? (
          <ArrowRight className="size-3.5 shrink-0 text-[var(--fg-subtle)] opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </div>
      <div className="space-y-1">
        <p className="tnum text-xl leading-tight font-semibold tracking-tight sm:text-2xl">{value}</p>
        {hasDelta ? (
          <p className="flex items-center gap-1 text-xs">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                flat
                  ? 'text-[var(--fg-muted)]'
                  : good
                    ? 'text-[var(--success)]'
                    : 'text-[var(--danger)]',
              )}
            >
              <DeltaIcon className="size-3" />
              {formatPercent(Math.abs(delta!))}
            </span>
            {comparisonLabel ? (
              <span className="text-[var(--fg-subtle)]">vs {comparisonLabel}</span>
            ) : null}
          </p>
        ) : hint ? (
          <p className="text-xs text-[var(--fg-muted)]">{hint}</p>
        ) : null}
      </div>
      {footer ? <div className="mt-auto pt-1 text-xs text-[var(--fg-subtle)]">{footer}</div> : null}
    </div>
  );

  const wrapped = hint && hasDelta ? <Tooltip content={hint}>{body}</Tooltip> : body;
  return href ? (
    <Link href={href} className="block h-full focus-visible:rounded-[var(--radius-card)]">
      {wrapped}
    </Link>
  ) : (
    wrapped
  );
}

export interface MiniStatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

/**
 * A quieter number for supporting figures. Several of these sit inside one
 * bordered strip, so a screen can carry a dozen numbers without turning into a
 * wall of cards.
 */
function MiniStat({ label, value, hint, href, tone = 'default' }: MiniStatProps) {
  const body = (
    <div className="flex h-full flex-col gap-0.5 px-4 py-3.5">
      <p className="text-xs text-[var(--fg-muted)]">{label}</p>
      <p
        className={cn(
          'tnum text-lg leading-tight font-semibold tracking-tight',
          tone === 'warning' && 'text-[var(--warning)]',
          tone === 'danger' && 'text-[var(--danger)]',
          tone === 'success' && 'text-[var(--success)]',
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-[var(--fg-subtle)]">{hint}</p> : null}
    </div>
  );
  return (
    // A hairline outline rather than a gap: neighbouring cells share the same
    // line, and the strip stays clean however the last row wraps.
    <div className="bg-[var(--surface)] outline-[0.5px] outline-[var(--border)]">
      {href ? (
        <Link
          href={href}
          className="block h-full transition-colors hover:bg-[var(--surface-sunken)]"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

const STRIP_COLUMNS: Record<number, string> = {
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
};

/**
 * A row of supporting figures in one bordered block. Takes the figures as data
 * rather than children so a caller can build the list conditionally without the
 * strip having to reason about fragments.
 */
export function MiniStatStrip({
  items,
  columns = 4,
}: {
  items: MiniStatProps[];
  columns?: 3 | 4 | 5;
}) {
  return (
    <div
      className={cn(
        'grid overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]',
        STRIP_COLUMNS[columns],
      )}
    >
      {items.map((item) => (
        <MiniStat key={item.label} {...item} />
      ))}
    </div>
  );
}
