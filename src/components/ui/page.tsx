import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6 space-y-3', className)}>
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-[var(--fg-subtle)]">
            {breadcrumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight className="size-3" aria-hidden /> : null}
                {c.href ? (
                  <Link href={c.href} className="hover:text-[var(--fg)] hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-[var(--fg-muted)]">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-sm text-[var(--fg-muted)]">{description}</p>
          ) : null}
          {meta}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function SectionHeading({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-[var(--fg)] uppercase">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Every figure in the app that is not a direct read of a connected system
 * must say where it came from. This is the component that says it.
 */
export function SourceNote({
  source,
  updatedAt,
  className,
}: {
  source: string;
  updatedAt?: string | null;
  className?: string;
}) {
  return (
    <p className={cn('text-[11px] text-[var(--fg-subtle)]', className)}>
      Source: {source}
      {updatedAt ? ` · updated ${updatedAt}` : ''}
    </p>
  );
}

export function DefinitionList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: React.ReactNode; span?: boolean }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-4',
        { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' }[columns],
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className={cn('min-w-0', item.span && 'sm:col-span-full')}>
          <dt className="text-[11px] font-medium tracking-wide text-[var(--fg-subtle)] uppercase">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm break-words text-[var(--fg)]">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
