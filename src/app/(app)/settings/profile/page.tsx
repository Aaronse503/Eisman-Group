import type { Metadata } from 'next';
import { requireActor } from '@/lib/auth/actor';
import { sql } from '@/lib/db/client';
import { ROLE_LABELS } from '@/lib/rbac/permissions';
import { fmtDateTime } from '@/lib/dates';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DefinitionList } from '@/components/ui/page';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/misc';
import { ProfileForm } from './profile-form';
import { ChangePasswordForm } from './change-password';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const actor = await requireActor();
  const [detail] = await sql<{
    title: string | null; phone: string | null; timezone: string;
    last_login_at: Date | null; created_at: Date; must_change_password: boolean;
  }>(
    `select title, phone, timezone, last_login_at, created_at, must_change_password
     from users where id = $1`,
    [actor.user.id],
  );

  return (
    <div className="max-w-2xl space-y-6">
      {detail?.must_change_password ? (
        <Card className="border-[var(--warning)]/40">
          <CardContent className="py-4 text-sm">
            <p className="font-medium">Change your password</p>
            <p className="text-[var(--fg-muted)]">
              This account still uses its initial password. Set a new one below before you use the
              system for real work.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Avatar name={actor.user.name} src={actor.user.avatar_url} size={40} />
            {actor.user.name}
          </CardTitle>
          <CardDescription>{actor.user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <DefinitionList
            columns={2}
            items={[
              { label: 'Title', value: detail?.title ?? '—' },
              { label: 'Time zone', value: detail?.timezone ?? '—' },
              { label: 'Last sign-in', value: detail?.last_login_at ? fmtDateTime(detail.last_login_at) : '—' },
              { label: 'Account created', value: fmtDateTime(detail?.created_at) },
              {
                label: 'Your roles',
                value: (
                  <span className="flex flex-wrap gap-1">
                    {actor.grants.length === 0 ? (
                      <span className="text-[var(--fg-subtle)]">No roles assigned</span>
                    ) : (
                      actor.grants.map((g, i) => (
                        <Badge key={i} tone="accent">
                          {ROLE_LABELS[g.role]}
                          {g.companyId
                            ? ` · ${actor.companies.find((c) => c.id === g.companyId)?.name ?? 'Company'}`
                            : ' · All companies'}
                        </Badge>
                      ))
                    )}
                  </span>
                ),
                span: true,
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit your details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            defaults={{
              name: actor.user.name,
              title: detail?.title ?? '',
              phone: detail?.phone ?? '',
              timezone: detail?.timezone ?? 'America/New_York',
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Changing your password signs out every other device immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
