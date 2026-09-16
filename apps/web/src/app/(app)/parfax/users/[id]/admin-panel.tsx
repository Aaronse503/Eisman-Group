'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Gift, Info, Pencil, ShieldOff, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/misc';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  correctParfaxUserFieldAction, grantPromoAccessAction, setParfaxUserStatusAction,
} from '@/server/actions/parfax';

const CORRECTABLE = [
  { value: 'name', label: 'Display name' },
  { value: 'handle', label: 'Handle' },
  { value: 'email', label: 'Email' },
  { value: 'country', label: 'Country' },
  { value: 'region', label: 'Region' },
  { value: 'acquisition_source', label: 'Acquisition source' },
] as const;

export function UserAdminPanel({
  userId,
  email,
  status,
  promoAccess,
  promoExpiresAt,
  name,
  handle,
  country,
  region,
  acquisitionSource,
}: {
  userId: string;
  email: string;
  status: string;
  promoAccess: string | null;
  promoExpiresAt: Date | null;
  name: string | null;
  handle: string | null;
  country: string | null;
  region: string | null;
  acquisitionSource: string | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<'suspend' | 'promo' | 'correct' | null>(null);
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [promo, setPromo] = React.useState(promoAccess ?? '');
  const [promoExpiry, setPromoExpiry] = React.useState(
    promoExpiresAt ? new Date(promoExpiresAt).toISOString().slice(0, 10) : '',
  );
  const [field, setField] = React.useState<(typeof CORRECTABLE)[number]['value']>('name');
  const [value, setValue] = React.useState('');

  const current: Record<string, string | null> = {
    name, handle, email, country, region, acquisition_source: acquisitionSource,
  };

  React.useEffect(() => {
    setValue(current[field] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field]);

  const close = () => {
    setDialog(null);
    setReason('');
  };

  const suspended = status === 'suspended';

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Administration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant={suspended ? 'secondary' : 'danger'} size="sm" onClick={() => setDialog('suspend')}>
              {suspended ? <ShieldCheck /> : <ShieldOff />}
              {suspended ? 'Reactivate' : 'Suspend'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDialog('promo')}>
              <Gift /> {promoAccess ? 'Change promo' : 'Grant promo'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDialog('correct')}>
              <Pencil /> Correct a field
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-[var(--info)]/40 bg-[var(--info-bg)] px-3 py-2 text-xs">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <p>
              Plan, price and lifetime value are owned by the billing provider and cannot be changed
              here — doing so would misstate revenue. Use promotional access for a comped
              entitlement, and make real billing changes in the provider.
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialog === 'suspend'} onOpenChange={(v) => !v && close()}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{suspended ? 'Reactivate' : 'Suspend'} {email}</DialogTitle>
            <DialogDescription>
              {suspended
                ? 'The account regains access immediately.'
                : 'The account loses access until it is reactivated.'}{' '}
              The original status, the new status, your name and this reason are recorded permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Label htmlFor="suspend-reason" required>
              Reason
            </Label>
            <Input
              id="suspend-reason"
              className="mt-1.5"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Repeated marketplace policy violations, ticket #512"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant={suspended ? 'primary' : 'danger'}
              loading={pending}
              disabled={reason.trim().length < 10}
              onClick={async () => {
                setPending(true);
                const result = await setParfaxUserStatusAction({ userId, suspend: !suspended, reason });
                setPending(false);
                if (result.ok) {
                  toast.success(suspended ? 'Account reactivated' : 'Account suspended');
                  close();
                  router.refresh();
                } else {
                  toast.warning(result.error);
                  router.refresh();
                }
              }}
            >
              {suspended ? 'Reactivate' : 'Suspend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'promo'} onOpenChange={(v) => !v && close()}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Promotional access</DialogTitle>
            <DialogDescription>
              Grants an entitlement without touching the billing plan, so revenue reporting stays
              accurate. Leave the label blank to revoke.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="promo-label">Access label</Label>
              <Input
                id="promo-label"
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                placeholder="e.g. Pro features — ambassador programme"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promo-expiry">Expires</Label>
              <Input
                id="promo-expiry"
                type="date"
                value={promoExpiry}
                onChange={(e) => setPromoExpiry(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="promo-reason" required>
                Reason
              </Label>
              <Input
                id="promo-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Ambassador agreement signed 12 Sep"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={reason.trim().length < 10}
              onClick={async () => {
                setPending(true);
                const result = await grantPromoAccessAction({
                  userId,
                  promoAccess: promo.trim() || null,
                  expiresAt: promoExpiry || undefined,
                  reason,
                });
                setPending(false);
                if (result.ok) {
                  toast.success(promo.trim() ? 'Promotional access granted' : 'Promotional access revoked');
                  close();
                  router.refresh();
                } else toast.error(result.error);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'correct'} onOpenChange={(v) => !v && close()}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Correct an administrative field</DialogTitle>
            <DialogDescription>
              Only these fields can be corrected here. The original value is preserved in the audit
              log alongside the new one.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="correct-field">Field</Label>
              <NativeSelect
                id="correct-field"
                value={field}
                onChange={(e) => setField(e.target.value as typeof field)}
              >
                {CORRECTABLE.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </NativeSelect>
              <p className="text-xs text-[var(--fg-subtle)]">
                Current value: {current[field] || '—'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="correct-value">New value</Label>
              <Input id="correct-value" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="correct-reason" required>
                Reason
              </Label>
              <Input
                id="correct-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Typo reported by the player in ticket #488"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={reason.trim().length < 10}
              onClick={async () => {
                setPending(true);
                const result = await correctParfaxUserFieldAction({ userId, field, value, reason });
                setPending(false);
                if (result.ok) {
                  toast.success('Field corrected and recorded');
                  close();
                  router.refresh();
                } else toast.error(result.error);
              }}
            >
              Save correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
