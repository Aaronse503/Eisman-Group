import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { listMembersAction } from '@/server/actions/members';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForbiddenState } from '@/components/ui/states';
import { MembersAdmin } from './members-admin';

export const metadata: Metadata = { title: 'Members' };
export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const actor = await requireActor();
  if (!actor.can('user:manage')) {
    return <ForbiddenState permission="user:manage" backHref="/settings/profile" />;
  }
  const { users, grants } = await listMembersAction();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members and access</CardTitle>
        <CardDescription>
          Who can sign in, and what each person can do in each company. Role changes and
          deactivations are recorded in the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MembersAdmin
          users={users.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            title: u.title,
            status: u.status,
            isDemo: u.is_demo,
            lastLoginAt: u.last_login_at,
            grants: grants
              .filter((g) => g.user_id === u.id)
              .map((g) => ({ companyId: g.company_id, role: g.role })),
          }))}
          companies={actor.companies.map((c) => ({ id: c.id, name: c.name }))}
          isHoldingsOwner={actor.isHoldingsOwner}
          currentUserId={actor.user.id}
        />
      </CardContent>
    </Card>
  );
}
