import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Inbox, Lock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Card } from './card';

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-strong)] px-6 py-14 text-center',
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-[var(--surface-sunken)]">
        <Icon className="size-5 text-[var(--fg-subtle)]" />
      </span>
      <div className="space-y-1">
        <p className="font-medium text-[var(--fg)]">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-sm text-[var(--fg-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-6 py-12 text-center',
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="size-6 text-[var(--danger)]" />
      <div className="space-y-1">
        <p className="font-medium text-[var(--fg)]">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-sm text-[var(--fg-muted)]">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      ) : null}
    </div>
  );
}

export function ForbiddenState({
  permission,
  backHref = '/',
}: {
  permission?: string;
  backHref?: string;
}) {
  return (
    <Card className="mx-auto max-w-lg">
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-[var(--warning-bg)]">
          <Lock className="size-5 text-[var(--warning)]" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">You don&apos;t have access to this</p>
          <p className="text-sm text-[var(--fg-muted)]">
            Your role doesn&apos;t include
            {permission ? (
              <code className="mx-1 rounded bg-[var(--surface-sunken)] px-1 py-0.5 text-xs">
                {permission}
              </code>
            ) : (
              ' the required permission '
            )}
            for this company. Ask a Holdings Owner or Company Admin to grant it.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={backHref}>Back to safety</Link>
        </Button>
      </div>
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-10', c === 0 ? 'w-[28%]' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-[var(--radius-card)]" />
      ))}
    </div>
  );
}
