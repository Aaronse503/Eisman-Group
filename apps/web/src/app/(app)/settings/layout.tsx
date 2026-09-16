import { requireActor } from '@/lib/auth/actor';
import { PageHeader } from '@/components/ui/page';
import { SettingsNav, type SettingsTab } from './settings-nav';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();

  const tabs: SettingsTab[] = [
    { href: '/settings/profile', label: 'Profile', icon: 'User' },
    { href: '/settings/sessions', label: 'Sessions', icon: 'Monitor' },
    { href: '/settings/permissions', label: 'Roles & permissions', icon: 'ShieldCheck' },
  ];
  if (actor.can('user:manage')) tabs.splice(1, 0, { href: '/settings/members', label: 'Members', icon: 'Users' });
  if (actor.can('import:run')) tabs.push({ href: '/settings/import', label: 'Import data', icon: 'Upload' });
  if (actor.can('audit:read')) tabs.push({ href: '/settings/audit', label: 'Audit log', icon: 'FileClock' });
  if (actor.can('demo:manage')) tabs.push({ href: '/settings/demo-data', label: 'Demo data', icon: 'Database' });

  return (
    <>
      <PageHeader title="Settings" description="Your account, who has access, data tools and the audit trail." />
      <div className="flex flex-col gap-6 lg:flex-row">
        <SettingsNav tabs={tabs} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
