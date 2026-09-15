'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { KeyRound, Plus, ShieldOff, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label, Avatar } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status';
import { Field, FormGrid } from '@/components/form';
import { fmtRelative } from '@/lib/dates';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/rbac/permissions';
import {
  inviteMemberAction, resetMemberPasswordAction, setRoleAction, setUserActiveAction,
} from '@/server/actions/members';

interface MemberView {
  id: string;
  email: string;
  name: string;
  title: string | null;
  status: string;
  isDemo: boolean;
  lastLoginAt: Date | null;
  grants: { companyId: string | null; role: Role }[];
}

export function MembersAdmin({
  users,
  companies,
  isHoldingsOwner,
  currentUserId,
}: {
  users: MemberView[];
  companies: { id: string; name: string }[];
  isHoldingsOwner: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [invite, setInvite] = React.useState({ email: '', name: '', title: '', role: 'team_member' as Role, companyId: companies[0]?.id ?? '' });
  const [pending, setPending] = React.useState(false);
  const [credential, setCredential] = React.useState<{ email: string; password: string } | null>(null);
  const [deactivate, setDeactivate] = React.useState<MemberView | null>(null);
  const [reason, setReason] = React.useState('');
  const [roleTarget, setRoleTarget] = React.useState<MemberView | null>(null);
  const [newRole, setNewRole] = React.useState<Role>('team_member');
  const [newRoleCompany, setNewRoleCompany] = React.useState<string>(companies[0]?.id ?? '');

  const companyName = (id: string | null) =>
    id ? (companies.find((c) => c.id === id)?.name ?? 'Company') : 'All companies';

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus /> Invite someone
        </Button>
      </div>

      <div className="space-y-2">
        {users.map((user) => (
          <div key={user.id} className="rounded-lg border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar name={user.name} size={36} />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">
                    {user.name}
                    {user.id === currentUserId ? <Badge tone="accent">You</Badge> : null}
                    {user.isDemo ? <Badge tone="gold">Demo account</Badge> : null}
                    <StatusBadge status={user.status} />
                  </p>
                  <p className="truncate text-xs text-[var(--fg-subtle)]">
                    {user.email}
                    {user.title ? ` · ${user.title}` : ''}
                    {user.lastLoginAt ? ` · last signed in ${fmtRelative(user.lastLoginAt)}` : ' · never signed in'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRoleTarget(user);
                    setNewRole('team_member');
                    setNewRoleCompany(companies[0]?.id ?? '');
                  }}
                >
                  <Plus /> Role
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const why = window.prompt('Why are you resetting this password?');
                    if (!why || why.trim().length < 4) return;
                    setPending(true);
                    const result = await resetMemberPasswordAction(user.id, why);
                    setPending(false);
                    if (result.ok) {
                      setCredential({ email: user.email, password: result.data.temporaryPassword });
                      router.refresh();
                    } else toast.error(result.error);
                  }}
                >
                  <KeyRound /> Reset password
                </Button>
                {user.id !== currentUserId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeactivate(user);
                      setReason('');
                    }}
                  >
                    <ShieldOff /> {user.status === 'deactivated' ? 'Reactivate' : 'Deactivate'}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {user.grants.length === 0 ? (
                <span className="text-xs text-[var(--fg-subtle)]">No roles — this person cannot see anything.</span>
              ) : (
                user.grants.map((g, i) => (
                  <Badge key={i} tone={g.companyId === null ? 'gold' : 'accent'}>
                    {ROLE_LABELS[g.role]} · {companyName(g.companyId)}
                    <button
                      type="button"
                      aria-label={`Remove ${ROLE_LABELS[g.role]} for ${companyName(g.companyId)}`}
                      className="-mr-0.5 ml-0.5 rounded hover:opacity-70"
                      onClick={async () => {
                        const result = await setRoleAction({
                          userId: user.id,
                          role: g.role,
                          companyId: g.companyId,
                          grant: false,
                        });
                        if (result.ok) {
                          toast.success('Role removed');
                          router.refresh();
                        } else toast.error(result.error);
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>
              Creates an account with a temporary password that must be changed at first sign-in.
              No email is sent — pass the password on securely yourself.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FormGrid>
              <Field label="Name" htmlFor="invite-name" required>
                <Input id="invite-name" value={invite.name} onChange={(e) => setInvite((v) => ({ ...v, name: e.target.value }))} />
              </Field>
              <Field label="Email" htmlFor="invite-email" required>
                <Input id="invite-email" type="email" value={invite.email} onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))} />
              </Field>
              <Field label="Title" htmlFor="invite-title">
                <Input id="invite-title" value={invite.title} onChange={(e) => setInvite((v) => ({ ...v, title: e.target.value }))} />
              </Field>
              <Field label="Role" htmlFor="invite-role" required>
                <NativeSelect
                  id="invite-role"
                  value={invite.role}
                  onChange={(e) => setInvite((v) => ({ ...v, role: e.target.value as Role }))}
                >
                  {ROLES.filter((r) => isHoldingsOwner || r !== 'holdings_owner').map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label="Company"
                htmlFor="invite-company"
                required
                hint={isHoldingsOwner ? 'Choose “All companies” for a holdings-wide role.' : undefined}
                span
              >
                <NativeSelect
                  id="invite-company"
                  value={invite.companyId}
                  onChange={(e) => setInvite((v) => ({ ...v, companyId: e.target.value }))}
                >
                  {isHoldingsOwner ? <option value="">All companies (holdings-wide)</option> : null}
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </NativeSelect>
              </Field>
            </FormGrid>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={!invite.email || invite.name.trim().length < 2}
              onClick={async () => {
                setPending(true);
                const result = await inviteMemberAction({
                  ...invite,
                  companyId: invite.companyId || null,
                });
                setPending(false);
                if (result.ok) {
                  setInviteOpen(false);
                  if (result.data.temporaryPassword) {
                    setCredential({ email: invite.email, password: result.data.temporaryPassword });
                  } else {
                    toast.success('Role granted to the existing account');
                  }
                  setInvite({ email: '', name: '', title: '', role: 'team_member', companyId: companies[0]?.id ?? '' });
                  router.refresh();
                } else toast.error(result.error);
              }}
            >
              Create account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(credential)} onOpenChange={(v) => !v && setCredential(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
            <DialogDescription>
              This is shown once and is not stored in readable form. Send it through a secure channel
              — the account must change it at first sign-in.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2">
            <p className="text-sm">
              <strong>{credential?.email}</strong>
            </p>
            <pre className="rounded-lg bg-[var(--surface-sunken)] p-3 font-mono text-sm break-all select-all">
              {credential?.password}
            </pre>
          </DialogBody>
          <DialogFooter>
            <Button variant="primary" onClick={() => setCredential(null)}>
              I have copied it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(roleTarget)} onOpenChange={(v) => !v && setRoleTarget(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Add a role for {roleTarget?.name}</DialogTitle>
            <DialogDescription>
              Roles add up: someone can hold different roles in different companies.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-role">Role</Label>
              <NativeSelect id="add-role" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                {ROLES.filter((r) => isHoldingsOwner || r !== 'holdings_owner').map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-role-company">Company</Label>
              <NativeSelect
                id="add-role-company"
                value={newRoleCompany}
                onChange={(e) => setNewRoleCompany(e.target.value)}
              >
                {isHoldingsOwner ? <option value="">All companies (holdings-wide)</option> : null}
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </NativeSelect>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={async () => {
                if (!roleTarget) return;
                setPending(true);
                const result = await setRoleAction({
                  userId: roleTarget.id,
                  role: newRole,
                  companyId: newRoleCompany || null,
                  grant: true,
                });
                setPending(false);
                if (result.ok) {
                  toast.success('Role granted');
                  setRoleTarget(null);
                  router.refresh();
                } else toast.error(result.error);
              }}
            >
              Grant role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deactivate)} onOpenChange={(v) => !v && setDeactivate(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {deactivate?.status === 'deactivated' ? 'Reactivate' : 'Deactivate'} {deactivate?.name}
            </DialogTitle>
            <DialogDescription>
              {deactivate?.status === 'deactivated'
                ? 'The account can sign in again with its existing password.'
                : 'The account is signed out of every device immediately and cannot sign in again until reactivated. No records are deleted.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="deactivate-reason" required>
              Reason
            </Label>
            <Input
              id="deactivate-reason"
              className="mt-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeactivate(null)}>
              Cancel
            </Button>
            <Button
              variant={deactivate?.status === 'deactivated' ? 'primary' : 'danger'}
              loading={pending}
              disabled={reason.trim().length < 4}
              onClick={async () => {
                if (!deactivate) return;
                setPending(true);
                const result = await setUserActiveAction({
                  userId: deactivate.id,
                  deactivate: deactivate.status !== 'deactivated',
                  reason,
                });
                setPending(false);
                if (result.ok) {
                  toast.success('Account updated');
                  setDeactivate(null);
                  router.refresh();
                } else toast.error(result.error);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
