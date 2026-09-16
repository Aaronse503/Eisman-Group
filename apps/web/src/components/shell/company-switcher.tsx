'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, ChevronsUpDown, Layers, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { setScopeAction } from '@/server/actions/shell';
import { cn } from '@/lib/utils';

export interface SwitcherCompany {
  id: string;
  slug: string;
  name: string;
  brand_color: string;
  is_demo: boolean;
  status: string;
}

export function CompanySwitcher({
  companies,
  activeSlug,
  canCreate,
}: {
  companies: SwitcherCompany[];
  activeSlug: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const active = companies.find((c) => c.slug === activeSlug);

  const select = (slug: string) => {
    startTransition(async () => {
      const res = await setScopeAction(slug);
      if (res.ok) router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          // Shrinkable, so the actions on the right of the bar always fit:
          // on a narrow screen the workspace name truncates instead.
          className="h-9 min-w-0 max-w-[11rem] shrink justify-between gap-2 px-2.5 sm:max-w-[13rem]"
          aria-label="Switch workspace"
          loading={pending}
        >
          <span className="flex min-w-0 items-center gap-2">
            {active ? (
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: active.brand_color }}
                aria-hidden
              />
            ) : (
              <Layers className="size-4 shrink-0 text-[var(--gold)]" />
            )}
            <span className="truncate text-sm font-medium">
              {active ? active.name : 'Eisman Holdings'}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => select('holdings')}>
          <Layers />
          <span className="flex-1">Eisman Holdings</span>
          <span className="text-[11px] text-[var(--fg-subtle)]">All companies</span>
          {activeSlug === 'holdings' ? <Check className="!text-[var(--accent)]" /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Companies</DropdownMenuLabel>
        {companies.map((company) => (
          <DropdownMenuItem key={company.id} onSelect={() => select(company.slug)}>
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: company.brand_color }}
              aria-hidden
            />
            <span className={cn('flex-1 truncate', company.status !== 'active' && 'opacity-60')}>
              {company.name}
            </span>
            {company.is_demo ? (
              <Badge tone="gold" className="px-1.5 py-0 text-[10px]">
                Demo
              </Badge>
            ) : null}
            {activeSlug === company.slug ? <Check className="!text-[var(--accent)]" /> : null}
          </DropdownMenuItem>
        ))}
        {canCreate ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push('/companies/new')}>
              <Plus /> New company
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push('/companies')}>
              <Building2 /> Manage companies
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
