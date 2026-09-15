'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { ArrowRight, Clock, Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { NavIcon } from '@/components/icon';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/nav';

export interface SearchHit {
  id: string;
  type: string;
  typeLabel: string;
  label: string;
  sublabel?: string | null;
  href: string;
  company?: string | null;
}

export interface RecentItem {
  label: string;
  href: string;
  entity_type: string;
}

/**
 * Universal command palette: ⌘K / Ctrl-K anywhere. Combines navigation,
 * quick-create shortcuts and live global search across every entity the
 * signed-in user is allowed to read.
 */
export function CommandPalette({
  navItems,
  recents,
  scopeSlug,
  quickCreate,
}: {
  navItems: NavItem[];
  recents: RecentItem[];
  scopeSlug: string;
  quickCreate: { label: string; href: string; icon: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    const onOpen = () => setOpen(true);
    window.addEventListener('ehcc:open-command-palette', onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('ehcc:open-command-palette', onOpen);
    };
  }, []);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setHits([]);
      return;
    }
  }, [open]);

  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(term)}&company=${encodeURIComponent(scopeSlug)}`,
          { signal: controller.signal },
        );
        if (res.ok) setHits(((await res.json()) as { results: SearchHit[] }).results);
      } catch {
        /* aborted or offline — the palette still works for navigation */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, scopeSlug]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const scoped = (href: string) =>
    scopeSlug === 'holdings' ? href : `${href}${href.includes('?') ? '&' : '?'}company=${scopeSlug}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="lg" className="top-[12%] translate-y-0 p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command shouldFilter={false} loop className="flex max-h-[28rem] flex-col">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-4">
            {loading ? (
              <Loader2 className="size-4 animate-spin text-[var(--fg-subtle)]" />
            ) : (
              <Search className="size-4 text-[var(--fg-subtle)]" />
            )}
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search clients, tasks, investors, documents… or jump to a page"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-subtle)]"
            />
            <kbd className="hidden rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--fg-subtle)] sm:block">
              ESC
            </kbd>
          </div>
          <Command.List className="flex-1 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-[var(--fg-muted)]">
              {query.trim().length < 2
                ? 'Type at least two characters to search.'
                : loading
                  ? 'Searching…'
                  : 'No matches found.'}
            </Command.Empty>

            {hits.length > 0 ? (
              <Command.Group heading={<GroupLabel>Results</GroupLabel>}>
                {hits.map((hit) => (
                  <Item key={`${hit.type}-${hit.id}`} onSelect={() => go(hit.href)}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{hit.label}</span>
                      {hit.sublabel ? (
                        <span className="truncate text-xs text-[var(--fg-subtle)]">
                          {hit.sublabel}
                        </span>
                      ) : null}
                    </span>
                    {hit.company ? (
                      <span className="text-[11px] text-[var(--fg-subtle)]">{hit.company}</span>
                    ) : null}
                    <Badge tone="outline" className="shrink-0">
                      {hit.typeLabel}
                    </Badge>
                  </Item>
                ))}
              </Command.Group>
            ) : null}

            {query.trim().length < 2 ? (
              <>
                {recents.length > 0 ? (
                  <Command.Group heading={<GroupLabel>Recently viewed</GroupLabel>}>
                    {recents.slice(0, 5).map((r) => (
                      <Item key={r.href} onSelect={() => go(r.href)}>
                        <Clock className="size-4 text-[var(--fg-subtle)]" />
                        <span className="flex-1 truncate">{r.label}</span>
                      </Item>
                    ))}
                  </Command.Group>
                ) : null}

                <Command.Group heading={<GroupLabel>Create</GroupLabel>}>
                  {quickCreate.map((q) => (
                    <Item key={q.href} onSelect={() => go(scoped(q.href))}>
                      <NavIcon name={q.icon} className="size-4 text-[var(--fg-subtle)]" />
                      <span className="flex-1">{q.label}</span>
                      <ArrowRight className="size-3.5 text-[var(--fg-subtle)]" />
                    </Item>
                  ))}
                </Command.Group>
              </>
            ) : null}

            <Command.Group heading={<GroupLabel>Navigate</GroupLabel>}>
              {navItems
                .filter((i) =>
                  query.trim().length < 2
                    ? true
                    : i.label.toLowerCase().includes(query.trim().toLowerCase()),
                )
                .map((item) => (
                  <Item key={item.href} onSelect={() => go(scoped(item.href))}>
                    <NavIcon name={item.icon} className="size-4 text-[var(--fg-subtle)]" />
                    <span className="flex-1">{item.label}</span>
                    <span className="hidden text-[11px] text-[var(--fg-subtle)] sm:block">
                      {item.description}
                    </span>
                  </Item>
                ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-1.5 text-[10px] font-semibold tracking-wider text-[var(--fg-subtle)] uppercase">
      {children}
    </span>
  );
}

function Item({
  children,
  onSelect,
  className,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors data-[selected=true]:bg-[var(--surface-sunken)]',
        className,
      )}
    >
      {children}
    </Command.Item>
  );
}

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('ehcc:open-command-palette'));
}
