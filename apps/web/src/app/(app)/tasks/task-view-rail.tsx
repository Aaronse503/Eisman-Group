'use client';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { TASK_VIEWS, type TaskViewId } from '@/lib/domain/tasks';

export function TaskViewRail({
  active,
  counts,
  scopeSlug,
}: {
  active: TaskViewId;
  counts: Record<string, number>;
  scopeSlug: string;
}) {
  const href = (view: string) =>
    scopeSlug === 'holdings' ? `/tasks?view=${view}` : `/tasks?view=${view}&company=${scopeSlug}`;

  return (
    <nav aria-label="Task views" className="lg:w-52 lg:shrink-0">
      <ul className="no-scrollbar flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
        {TASK_VIEWS.map((view) => {
          const count = counts[view.id] ?? 0;
          const isActive = active === view.id;
          return (
            <li key={view.id}>
              <Link
                href={href(view.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent-soft-fg)]'
                    : 'text-[var(--fg-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--fg)]',
                )}
              >
                {view.label}
                {count > 0 ? (
                  <span
                    className={cn(
                      'tnum rounded-full px-1.5 text-xs',
                      view.id === 'overdue' && count > 0
                        ? 'bg-[var(--danger-bg)] text-[var(--danger)]'
                        : 'text-[var(--fg-subtle)]',
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
