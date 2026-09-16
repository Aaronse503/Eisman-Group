'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Database, FileClock, Monitor, ShieldCheck, Upload, User, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SettingsTab {
  href: string;
  label: string;
  icon: string;
}

const ICONS: Record<string, typeof User> = {
  User, Users, ShieldCheck, Monitor, FileClock, Upload, Database,
};

export function SettingsNav({ tabs }: { tabs: SettingsTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="lg:w-56 lg:shrink-0">
      <ul className="no-scrollbar flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
        {tabs.map((tab) => {
          const Icon = ICONS[tab.icon] ?? User;
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
                  active
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent-soft-fg)]'
                    : 'text-[var(--fg-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--fg)]',
                )}
              >
                <Icon className="size-4" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
