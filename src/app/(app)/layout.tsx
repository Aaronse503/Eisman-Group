import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { getScope } from '@/lib/scope';
import { sql } from '@/lib/db/client';
import { ensureMigrated } from '@/lib/db/migrate';
import { getEnv } from '@/lib/env';
import { NAV_SECTIONS, ALL_NAV_ITEMS } from '@/lib/nav';
import { ROLE_LABELS } from '@/lib/rbac/permissions';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar, type NotificationItem } from '@/components/shell/topbar';
import { CommandPalette, type RecentItem } from '@/components/shell/command-palette';

export const dynamic = 'force-dynamic';

const QUICK_CREATE = [
  { label: 'New client', href: '/crm/clients/new', icon: 'Users', permission: 'crm:write' },
  { label: 'New contact', href: '/crm/contacts/new', icon: 'Users', permission: 'crm:write' },
  { label: 'New task', href: '/tasks/new', icon: 'CircleCheckBig', permission: 'task:write' },
  { label: 'New meeting', href: '/calendar/new', icon: 'CalendarDays', permission: 'calendar:write' },
  { label: 'New investor', href: '/investors/new', icon: 'TrendingUp', permission: 'investor:write' },
  { label: 'New partnership', href: '/partnerships/new', icon: 'Handshake', permission: 'partnership:write' },
  { label: 'Upload document', href: '/knowledge/upload', icon: 'BookOpen', permission: 'knowledge:write' },
  { label: 'New invoice', href: '/finances/invoices/new', icon: 'Banknote', permission: 'finance:write' },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await ensureMigrated();
  const actor = await getActor();
  if (!actor) redirect('/login');

  const scope = await getScope(actor);
  const env = getEnv();
  const hasParfax = actor.companies.some((c) => c.slug === 'parfax');

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.parfaxOnly && !hasParfax) return false;
      return item.permission ? actor.can(item.permission, scope.companyId) : true;
    }),
  })).filter((section) => section.items.length > 0);

  const [notifications, recents] = await Promise.all([
    sql<NotificationItem>(
      `select id, kind, title, body, href, read_at, created_at
       from notifications where user_id = $1
       order by created_at desc limit 20`,
      [actor.user.id],
    ),
    sql<RecentItem>(
      `select label, href, entity_type from recently_viewed
       where user_id = $1 order by viewed_at desc limit 10`,
      [actor.user.id],
    ),
  ]);

  const quickCreate = QUICK_CREATE.filter((q) => actor.can(q.permission, scope.companyId)).map(
    ({ label, href, icon }) => ({ label, href, icon }),
  );

  const roles = actor.rolesFor(scope.companyId);
  const roleLabel = roles.length ? ROLE_LABELS[roles[0]!] : 'No role';

  const navItems = sections.flatMap((s) => s.items);

  return (
    <div className="flex min-h-dvh bg-[var(--bg)]">
      <aside className="print-hide sticky top-0 hidden h-dvh shrink-0 lg:block">
        <Sidebar sections={sections} scopeSlug={scope.slug} companyName={scope.label} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          sections={sections}
          companies={actor.companies
            .filter((c) => !c.archived_at)
            .map((c) => ({
              id: c.id,
              slug: c.slug,
              name: c.name,
              brand_color: c.brand_color,
              is_demo: c.is_demo,
              status: c.status,
            }))}
          scopeSlug={scope.slug}
          scopeLabel={scope.label}
          canCreateCompany={actor.can('company:create')}
          user={{
            name: actor.user.name,
            email: actor.user.email,
            avatar_url: actor.user.avatar_url,
            title: actor.user.title,
          }}
          roleLabel={roleLabel}
          notifications={notifications}
          quickCreate={quickCreate}
          demoMode={env.DEMO_MODE && actor.companies.some((c) => c.is_demo)}
        />
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[100rem]">{children}</div>
        </main>
      </div>

      <CommandPalette
        navItems={navItems.length ? navItems : ALL_NAV_ITEMS}
        recents={recents}
        scopeSlug={scope.slug}
        quickCreate={quickCreate}
      />
    </div>
  );
}
