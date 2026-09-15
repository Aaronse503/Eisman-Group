'use client';
import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, Layers, Printer } from 'lucide-react';
import { NativeSelect } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DATE_PRESETS, type DateRangePreset } from '@/lib/dates';
import { setScopeAction } from '@/server/actions/shell';

export function DashboardFilters({
  preset,
  scopeSlug,
  companies,
}: {
  preset: DateRangePreset;
  scopeSlug: string;
  companies: { id: string; slug: string; name: string; archived_at: Date | null }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(search.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="dashboard-company">
        Company
      </label>
      <NativeSelect
        id="dashboard-company"
        value={scopeSlug}
        disabled={pending}
        onChange={(e) => {
          const slug = e.target.value;
          startTransition(async () => {
            await setScopeAction(slug);
            const params = new URLSearchParams(search.toString());
            if (slug === 'holdings') params.delete('company');
            else params.set('company', slug);
            router.push(`${pathname}?${params.toString()}`);
            router.refresh();
          });
        }}
        className="w-[11rem]"
      >
        <option value="holdings">All companies</option>
        {companies
          .filter((c) => !c.archived_at)
          .map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
      </NativeSelect>

      <label className="sr-only" htmlFor="dashboard-range">
        Date range
      </label>
      <NativeSelect
        id="dashboard-range"
        value={preset}
        onChange={(e) => setParam('range', e.target.value)}
        className="w-[10rem]"
      >
        {DATE_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </NativeSelect>

      <Button variant="ghost" size="icon" onClick={() => window.print()} aria-label="Print this view" title="Print">
        <Printer />
      </Button>
      <span className="sr-only">
        <CalendarRange />
        <Layers />
      </span>
    </div>
  );
}
