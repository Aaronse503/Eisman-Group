'use client';
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavIcon } from '@/components/icon';
import { Tooltip } from '@/components/ui/misc';
import type { NavSection } from '@/lib/nav';

const STORAGE_KEY = 'ehcc:sidebar-collapsed';

export function Sidebar({
  sections,
  scopeSlug,
  companyName,
  onNavigate,
  variant = 'desktop',
}: {
  sections: NavSection[];
  scopeSlug: string;
  companyName: string;
  onNavigate?: () => void;
  variant?: 'desktop' | 'mobile';
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    if (variant !== 'desktop') return;
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, [variant]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  const isCollapsed = variant === 'desktop' && collapsed;
  const href = (path: string) =>
    scopeSlug === 'holdings' ? path : `${path}${path.includes('?') ? '&' : '?'}company=${scopeSlug}`;

  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex h-full flex-col bg-[var(--nav-bg)] text-[var(--nav-fg)] transition-[width] duration-200',
        isCollapsed ? 'w-[4.25rem]' : 'w-[15.5rem]',
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center gap-2 px-3',
          isCollapsed && 'justify-center px-0',
        )}
      >
        <Link
          href={href('/')}
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1"
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
            style={{ background: 'var(--color-gold-600)', color: '#1b1503' }}
            aria-hidden
          >
            EH
          </span>
          {!isCollapsed ? (
            <span className="min-w-0">
              <span className="block truncate text-sm leading-tight font-semibold text-white">
                Command Center
              </span>
              <span className="block truncate text-[11px] leading-tight text-[var(--nav-fg-muted)]">
                {companyName}
              </span>
            </span>
          ) : null}
        </Link>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-2 pb-4">
        {sections.map((section) => (
          <div key={section.label} className="mb-4">
            {!isCollapsed ? (
              <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--nav-fg-muted)] uppercase">
                {section.label}
              </p>
            ) : (
              <div className="mx-auto my-3 h-px w-6 bg-white/10" />
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const link = (
                  <Link
                    href={href(item.href)}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isCollapsed && 'justify-center px-0',
                      active
                        ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]'
                        : 'text-[var(--nav-fg)] hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <NavIcon name={item.icon} className="size-[18px] shrink-0" />
                    {!isCollapsed ? <span className="truncate">{item.label}</span> : null}
                    {active && !isCollapsed ? (
                      <span
                        className="ml-auto h-4 w-1 rounded-full"
                        style={{ background: 'var(--color-gold-600)' }}
                        aria-hidden
                      />
                    ) : null}
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {isCollapsed ? (
                      <Tooltip content={item.label} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {variant === 'desktop' ? (
        <button
          type="button"
          onClick={toggle}
          className="flex h-11 shrink-0 items-center justify-center gap-2 border-t border-white/10 text-xs font-medium text-[var(--nav-fg-muted)] transition-colors hover:bg-white/5 hover:text-white"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed ? 'Collapse' : null}
        </button>
      ) : null}
    </nav>
  );
}
