'use client';
import Link from 'next/link';
import { Briefcase, Building, Contact, Handshake } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'clients', label: 'Clients', href: '/crm', icon: Briefcase },
  { id: 'contacts', label: 'Contacts', href: '/crm/contacts', icon: Contact },
  { id: 'organizations', label: 'Organizations', href: '/crm/organizations', icon: Building },
  { id: 'deals', label: 'Deals', href: '/crm/deals', icon: Handshake },
] as const;

export function CrmNav({ active, scopeSlug }: { active: string; scopeSlug: string }) {
  const href = (path: string) => (scopeSlug === 'holdings' ? path : `${path}?company=${scopeSlug}`);
  return (
    <nav className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border)]" aria-label="CRM sections">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={href(tab.href)}
          aria-current={active === tab.id ? 'page' : undefined}
          className={cn(
            '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
            active === tab.id
              ? 'border-[var(--accent)] text-[var(--fg)]'
              : 'border-transparent text-[var(--fg-muted)] hover:border-[var(--border-strong)] hover:text-[var(--fg)]',
          )}
        >
          <tab.icon className="size-4" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
