'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, LifeBuoy, MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tab {
  href: string;
  label: string;
  icon: typeof Users;
  exact?: boolean;
}

const TABS: Tab[] = [
  { href: '/parfax', label: 'Overview', icon: BarChart3, exact: true },
  { href: '/parfax/users', label: 'Users', icon: Users },
  { href: '/parfax/metrics', label: 'Metrics', icon: BarChart3 },
  { href: '/parfax/locations', label: 'Locations', icon: MapPin },
  { href: '/parfax/support', label: 'Support', icon: LifeBuoy },
];

export function ParfaxNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="ParFax sections"
      className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border)]"
    >
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
              active
                ? 'border-[var(--accent)] text-[var(--fg)]'
                : 'border-transparent text-[var(--fg-muted)] hover:border-[var(--border-strong)] hover:text-[var(--fg)]',
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
