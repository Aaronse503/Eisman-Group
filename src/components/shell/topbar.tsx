'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  BookOpen,
  Check,
  Clock,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NavIcon } from '@/components/icon';
import { ThemeToggle } from '@/components/theme-provider';
import { Sidebar } from './sidebar';
import { CompanySwitcher, type SwitcherCompany } from './company-switcher';
import { openCommandPalette } from './command-palette';
import { markNotificationsReadAction, signOutAction } from '@/server/actions/shell';
import { fmtRelative } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { NavSection } from '@/lib/nav';

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

export function Topbar({
  sections,
  companies,
  scopeSlug,
  scopeLabel,
  canCreateCompany,
  user,
  roleLabel,
  notifications,
  quickCreate,
  demoMode,
}: {
  sections: NavSection[];
  companies: SwitcherCompany[];
  scopeSlug: string;
  scopeLabel: string;
  canCreateCompany: boolean;
  user: { name: string; email: string; avatar_url: string | null; title: string | null };
  roleLabel: string;
  notifications: NotificationItem[];
  quickCreate: { label: string; href: string; icon: string }[];
  demoMode: boolean;
}) {
  const router = useRouter();
  const [mobileNav, setMobileNav] = React.useState(false);
  const [items, setItems] = React.useState(notifications);
  React.useEffect(() => setItems(notifications), [notifications]);
  const unread = items.filter((n) => !n.read_at).length;

  const scoped = (href: string) =>
    scopeSlug === 'holdings' ? href : `${href}${href.includes('?') ? '&' : '?'}company=${scopeSlug}`;

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await markNotificationsReadAction();
    router.refresh();
  };

  return (
    <header className="print-hide sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)]/85 px-3 backdrop-blur-md sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileNav(true)}
        aria-label="Open navigation"
      >
        <Menu />
      </Button>

      <CompanySwitcher companies={companies} activeSlug={scopeSlug} canCreate={canCreateCompany} />

      <button
        type="button"
        onClick={openCommandPalette}
        className="hidden h-9 flex-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 text-sm text-[var(--fg-subtle)] transition-colors hover:border-[var(--border-strong)] md:flex md:max-w-md"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search everything…</span>
        <kbd className="rounded border border-[var(--border-strong)] px-1.5 py-0.5 font-sans text-[10px]">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={openCommandPalette} aria-label="Search">
          <Search />
        </Button>

        {demoMode ? (
          <Link href="/settings/demo-data" className="hidden sm:block">
            <Badge tone="gold" className="cursor-pointer">Demo data active</Badge>
          </Link>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="primary" size="sm" className="gap-1.5">
              <Plus /> <span className="hidden sm:inline">Create</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Quick create</DropdownMenuLabel>
            {quickCreate.map((q) => (
              <DropdownMenuItem key={q.href} onSelect={() => router.push(scoped(q.href))}>
                <NavIcon name={q.icon} className="size-4" />
                {q.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <Bell />
              {unread > 0 ? (
                <span
                  className="tnum absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
                  style={{ background: 'var(--danger)' }}
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <p className="text-sm font-semibold">Notifications</p>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                >
                  <Check className="size-3" /> Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-[var(--fg-muted)]">
                  You&apos;re all caught up.
                </p>
              ) : (
                items.map((n) => (
                  <Link
                    key={n.id}
                    href={n.href ?? '#'}
                    className={cn(
                      'flex gap-2.5 border-b border-[var(--border)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--surface-sunken)]',
                      !n.read_at && 'bg-[var(--accent-soft)]/40',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1.5 size-1.5 shrink-0 rounded-full',
                        n.read_at ? 'bg-transparent' : 'bg-[var(--accent)]',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{n.title}</span>
                      {n.body ? (
                        <span className="block text-xs text-[var(--fg-muted)]">{n.body}</span>
                      ) : null}
                      <span className="mt-0.5 block text-[11px] text-[var(--fg-subtle)]">
                        {fmtRelative(n.created_at)}
                      </span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-1 rounded-full focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
              aria-label="Account menu"
            >
              <Avatar name={user.name} src={user.avatar_url} size={32} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-[var(--fg-muted)]">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <Badge tone="accent">{roleLabel}</Badge>
                <Badge tone="outline">{scopeLabel}</Badge>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push('/settings/profile')}>
              <User /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/settings/permissions')}>
              <ShieldCheck /> Roles &amp; permissions
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/settings/sessions')}>
              <Clock /> Active sessions
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/settings')}>
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/knowledge/assistant')}>
              <BookOpen /> Ask the knowledge assistant
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => void signOutAction()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={mobileNav} onOpenChange={setMobileNav}>
        <DialogContent size="sm" className="top-0 left-0 h-full max-h-full w-[16rem] translate-x-0 translate-y-0 rounded-none border-l-0 p-0">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <Sidebar
            sections={sections}
            scopeSlug={scopeSlug}
            companyName={scopeLabel}
            variant="mobile"
            onNavigate={() => setMobileNav(false)}
          />
        </DialogContent>
      </Dialog>
    </header>
  );
}
