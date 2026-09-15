'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, FlaskConical, Info,
  KeyRound, Plug, RefreshCw, Unplug,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/misc';
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status';
import { fmtDateTime, fmtRelative } from '@/lib/dates';
import { cn, titleCase } from '@/lib/utils';
import {
  disconnectAction, ensureConnectionAction, saveCredentialsAction, setModeAction,
  setWriteBackAction, syncNowAction, testConnectionAction,
} from '@/server/actions/integrations';

interface ProviderView {
  id: string;
  name: string;
  tagline: string;
  category: string;
  scope: string;
  credentialFields: { key: string; label: string; type: string; required: boolean; placeholder?: string; help?: string; envVar?: string }[];
  requestedScopes: string[];
  syncs: string[];
  writeCapable: boolean;
  supportsDemo: boolean;
  setupSteps: string[];
  docsUrl?: string;
  status: string;
  plannedNote?: string;
}

interface ConnectionView {
  id: string;
  status: string;
  mode: string;
  accountName: string | null;
  scopes: string[];
  credentialsHint: string | null;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
  writeEnabled: boolean;
  companyName: string | null;
  conflictCount: number;
  envSupplied: string[];
  lastRun: {
    id: string; status: string; started_at: Date; finished_at: Date | null;
    records_read: number; records_written: number; conflicts: number;
    error: string | null; trigger: string;
  } | null;
}

export function IntegrationCard({
  provider,
  connection,
  canWrite,
  demoAvailable,
}: {
  provider: ProviderView;
  connection: ConnectionView | null;
  canWrite: boolean;
  demoAvailable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [credsOpen, setCredsOpen] = React.useState(false);
  const [writeOpen, setWriteOpen] = React.useState(false);
  const [creds, setCreds] = React.useState<Record<string, string>>({});
  const [writeReason, setWriteReason] = React.useState('');
  const [pending, setPending] = React.useState<string | null>(null);

  const planned = provider.status === 'planned';
  const connected = connection?.status === 'connected';
  const demoMode = connection?.mode === 'demo';

  const run = async (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setPending(label);
    const result = await fn();
    setPending(null);
    if (!result.ok) toast.error(result.error ?? 'That did not work.');
    router.refresh();
    return result;
  };

  return (
    <Card id={provider.id} className={cn('flex scroll-mt-24 flex-col', planned && 'opacity-80')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              {provider.name}
              {connection?.companyName ? (
                <Badge tone="outline">{connection.companyName}</Badge>
              ) : provider.scope === 'holding' ? (
                <Badge tone="outline">Holdings</Badge>
              ) : null}
            </CardTitle>
            <p className="mt-0.5 text-sm text-[var(--fg-muted)]">{provider.tagline}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {planned ? (
              <Badge tone="neutral">Planned</Badge>
            ) : demoMode ? (
              <Badge tone="gold">
                <FlaskConical className="size-3" /> Demo Mode
              </Badge>
            ) : connected ? (
              <Badge tone="success">
                <CheckCircle2 className="size-3" /> Connected
              </Badge>
            ) : connection?.status === 'error' ? (
              <Badge tone="danger">
                <AlertTriangle className="size-3" /> Error
              </Badge>
            ) : (
              <Badge tone="neutral">Disconnected</Badge>
            )}
            {connection?.writeEnabled ? <Badge tone="warning">Write-back on</Badge> : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        {planned ? (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--fg-muted)]">
            {provider.plannedNote}
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">Account</dt>
                <dd className="truncate">{connection?.accountName ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">Credential</dt>
                <dd className="truncate font-mono text-xs">
                  {connection?.envSupplied.length
                    ? 'From server environment'
                    : (connection?.credentialsHint ?? '—')}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">Last success</dt>
                <dd>{connection?.lastSuccessAt ? fmtRelative(connection.lastSuccessAt) : 'Never'}</dd>
              </div>
              <div>
                <dt className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">Last attempt</dt>
                <dd>{connection?.lastAttemptAt ? fmtRelative(connection.lastAttemptAt) : 'Never'}</dd>
              </div>
            </dl>

            {connection?.lastRun ? (
              <div className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={connection.lastRun.status} />
                  <span className="text-[var(--fg-muted)]">
                    {titleCase(connection.lastRun.trigger)} run · {fmtDateTime(connection.lastRun.started_at)}
                  </span>
                </div>
                <p className="tnum mt-1 text-[var(--fg-muted)]">
                  {connection.lastRun.records_read} read · {connection.lastRun.records_written} written
                  {connection.lastRun.conflicts ? ` · ${connection.lastRun.conflicts} conflicts` : ''}
                </p>
                {connection.lastRun.error ? (
                  <p className="mt-1 text-[var(--danger)]">{connection.lastRun.error}</p>
                ) : null}
              </div>
            ) : null}

            {connection?.lastError && !connection.lastRun?.error ? (
              <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger)]">
                {connection.lastError}
              </div>
            ) : null}

            {connection?.conflictCount ? (
              <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-3 py-2 text-xs text-[var(--warning)]">
                {connection.conflictCount} record(s) changed on both sides and were left alone rather
                than overwritten.
              </div>
            ) : null}
          </>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
          {open ? 'Hide details' : 'What this syncs and how to connect it'}
        </button>

        {open ? (
          <div className="space-y-3 rounded-lg bg-[var(--surface-sunken)] p-3 text-sm">
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                Syncs
              </p>
              <div className="flex flex-wrap gap-1">
                {provider.syncs.length ? (
                  provider.syncs.map((s) => (
                    <Badge key={s} tone="neutral">{s}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-[var(--fg-muted)]">Nothing yet.</span>
                )}
              </div>
            </div>
            {(connection?.scopes.length ? connection.scopes : provider.requestedScopes).length ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                  Permission scope
                </p>
                <div className="flex flex-wrap gap-1">
                  {(connection?.scopes.length ? connection.scopes : provider.requestedScopes).map((s) => (
                    <Badge key={s} tone="outline" className="font-mono text-[10px]">{s}</Badge>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                Setup
              </p>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-[var(--fg-muted)]">
                {provider.setupSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
            {provider.docsUrl ? (
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
              >
                Provider documentation <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
        ) : null}

        {!planned && canWrite ? (
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              loading={pending === 'creds'}
              onClick={async () => {
                if (!connection) {
                  await run('creds', () => ensureConnectionAction(provider.id, null));
                }
                setCreds({});
                setCredsOpen(true);
              }}
            >
              <KeyRound /> Credentials
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!connection}
              loading={pending === 'test'}
              onClick={async () => {
                if (!connection) return;
                const result = await run('test', () => testConnectionAction(connection.id));
                if (result.ok && 'data' in result) {
                  const test = (result as { data: { ok: boolean; message: string } }).data;
                  if (test.ok) toast.success(test.message);
                  else toast.error(test.message);
                }
              }}
            >
              <Plug /> Test connection
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!connection || connection.mode === 'disconnected'}
              loading={pending === 'sync'}
              onClick={async () => {
                if (!connection) return;
                const result = await run('sync', () => syncNowAction(connection.id));
                if (result.ok && 'data' in result) {
                  const sync = (result as { data: { recordsWritten: number; status: string } }).data;
                  toast.success(`Sync ${sync.status}: ${sync.recordsWritten} record(s) written`);
                }
              }}
            >
              <RefreshCw /> Sync now
            </Button>
            {provider.supportsDemo && demoAvailable ? (
              <Button
                variant="ghost"
                size="sm"
                loading={pending === 'demo'}
                onClick={async () => {
                  let id = connection?.id;
                  if (!id) {
                    const created = await ensureConnectionAction(provider.id, null);
                    if (!created.ok) {
                      toast.error(created.error);
                      return;
                    }
                    id = created.data.id;
                  }
                  await run('demo', () => setModeAction(id!, demoMode ? 'disconnected' : 'demo'));
                  toast.success(demoMode ? 'Demo Mode turned off' : 'Demo Mode enabled');
                }}
              >
                <FlaskConical /> {demoMode ? 'Leave Demo Mode' : 'Demo Mode'}
              </Button>
            ) : null}
            {connection && connection.status !== 'disconnected' ? (
              <Button
                variant="ghost"
                size="sm"
                loading={pending === 'disconnect'}
                onClick={async () => {
                  await run('disconnect', () => disconnectAction(connection.id));
                  toast.success('Disconnected and stored credentials removed');
                }}
              >
                <Unplug /> Disconnect
              </Button>
            ) : null}
            {provider.writeCapable && connection ? (
              <label className="ml-auto flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                Write-back
                <Switch
                  checked={connection.writeEnabled}
                  onCheckedChange={(v) => {
                    if (v) {
                      setWriteReason('');
                      setWriteOpen(true);
                    } else {
                      void run('writeback', () =>
                        setWriteBackAction({
                          connectionId: connection.id,
                          enabled: false,
                          reason: 'Write-back disabled from the integrations page.',
                        }),
                      );
                    }
                  }}
                  aria-label="Enable write-back"
                />
              </label>
            ) : null}
          </div>
        ) : null}
      </CardContent>

      <Dialog open={credsOpen} onOpenChange={setCredsOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{provider.name} credentials</DialogTitle>
            <DialogDescription>
              Stored encrypted with AES-256-GCM and never sent back to the browser. Leave a field
              blank to keep the value already stored. Values set as environment variables on the
              server take precedence.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {provider.credentialFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`${provider.id}-${field.key}`} required={field.required}>
                  {field.label}
                </Label>
                <Input
                  id={`${provider.id}-${field.key}`}
                  type={field.type === 'password' ? 'password' : 'text'}
                  placeholder={
                    connection?.envSupplied.includes(field.key)
                      ? 'Supplied by the server environment'
                      : field.placeholder
                  }
                  autoComplete="off"
                  value={creds[field.key] ?? ''}
                  onChange={(e) => setCreds((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
                {field.help || field.envVar ? (
                  <p className="text-xs text-[var(--fg-subtle)]">
                    {field.help}
                    {field.envVar ? ` Environment variable: ${field.envVar}.` : ''}
                  </p>
                ) : null}
              </div>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCredsOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={pending === 'save-creds'}
              onClick={async () => {
                if (!connection) return;
                const result = await run('save-creds', () =>
                  saveCredentialsAction(connection.id, creds),
                );
                if (result.ok) {
                  toast.success('Saved. Test the connection to verify it.');
                  setCredsOpen(false);
                }
              }}
            >
              Save credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={writeOpen} onOpenChange={setWriteOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Enable write-back to {provider.name}</DialogTitle>
            <DialogDescription>
              This lets the Command Center change data in {provider.name}. It is off by default and
              stays off until someone explicitly turns it on. Enabling it is recorded in the audit
              log as a critical event.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-3 py-2 text-xs">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Make sure the field map has been reviewed first, so an edit here cannot overwrite the
              wrong field there.
            </div>
            <Label htmlFor="writeback-reason" required>
              Why is this being enabled?
            </Label>
            <Input
              id="writeback-reason"
              value={writeReason}
              onChange={(e) => setWriteReason(e.target.value)}
              placeholder="e.g. Approved by the ParFax team after the field map review on 3 Oct"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWriteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={writeReason.trim().length < 10}
              loading={pending === 'writeback'}
              onClick={async () => {
                if (!connection) return;
                const result = await run('writeback', () =>
                  setWriteBackAction({ connectionId: connection.id, enabled: true, reason: writeReason }),
                );
                if (result.ok) {
                  toast.success('Write-back enabled and recorded');
                  setWriteOpen(false);
                }
              }}
            >
              Enable write-back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
