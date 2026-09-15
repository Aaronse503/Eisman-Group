'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, FileUp, TriangleAlert, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Field, FormActions, FormError, FormGrid, FormSection } from '@/components/form';
import { uploadDocumentAction, type UploadResult } from '@/server/actions/knowledge';
import { cn, formatNumber } from '@/lib/utils';

const ACCESS_LEVELS = [
  { value: 'company', label: 'Company — anyone in this company' },
  { value: 'finance', label: 'Finance — finance roles and admins' },
  { value: 'investor', label: 'Investor — investor-facing material' },
  { value: 'hr', label: 'HR — people and compensation material' },
  { value: 'restricted', label: 'Restricted — company admins only' },
];

export function UploadForm({
  companies,
  folders,
  defaultCompanyId,
  entityType,
  entityId,
  canSetRestricted,
}: {
  companies: { id: string; name: string }[];
  folders: { id: string; name: string; company_id: string }[];
  defaultCompanyId: string;
  entityType?: string | null;
  entityId?: string | null;
  canSetRestricted: boolean;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = React.useState(defaultCompanyId);
  const [folderId, setFolderId] = React.useState('');
  const [accessLevel, setAccessLevel] = React.useState('company');
  const [description, setDescription] = React.useState('');
  const [files, setFiles] = React.useState<File[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<UploadResult[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 10));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) {
      setError('Choose at least one file.');
      return;
    }
    setPending(true);
    setError(null);
    const uploaded: UploadResult[] = [];

    for (const file of files) {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('companyId', companyId);
      if (folderId) formData.set('folderId', folderId);
      formData.set('accessLevel', accessLevel);
      if (description) formData.set('description', description);
      if (entityType && entityId) {
        formData.set('entityType', entityType);
        formData.set('entityId', entityId);
      }
      const result = await uploadDocumentAction(formData);
      if (result.ok) {
        uploaded.push(result.data);
      } else {
        setError(`${file.name}: ${result.error}`);
        break;
      }
    }

    setPending(false);
    setResults(uploaded);
    if (uploaded.length) {
      setFiles([]);
      toast.success(`${uploaded.length} file${uploaded.length === 1 ? '' : 's'} uploaded`);
      router.refresh();
    }
  };

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-6" noValidate>
      <FormError message={error} />

      <FormSection title="Files" description="PDFs, documents, spreadsheets, decks, text and images. Up to 25MB each.">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging
              ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
              : 'border-[var(--border-strong)] bg-[var(--surface-sunken)]/50',
          )}
        >
          <FileUp className="size-7 text-[var(--fg-subtle)]" />
          <p className="text-sm font-medium">Drop files here</p>
          <p className="text-xs text-[var(--fg-muted)]">or</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => addFiles(e.target.files)}
            aria-label="Choose files to upload"
          />
        </div>

        {files.length ? (
          <ul className="space-y-1.5">
            {files.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="tnum shrink-0 text-xs text-[var(--fg-subtle)]">
                  {formatNumber(Math.max(1, Math.round(file.size / 1024)))} KB
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </FormSection>

      <FormSection title="Where it goes">
        <FormGrid>
          <Field label="Company" htmlFor="companyId" required>
            <NativeSelect id="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Folder" htmlFor="folderId">
            <NativeSelect id="folderId" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">No folder</option>
              {folders.filter((f) => f.company_id === companyId).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Who can see it"
            htmlFor="accessLevel"
            hint="Restricted documents are visible to company admins only."
            span
          >
            <NativeSelect id="accessLevel" value={accessLevel} onChange={(e) => setAccessLevel(e.target.value)}>
              {ACCESS_LEVELS.filter((l) => l.value !== 'restricted' || canSetRestricted).map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Description" htmlFor="description" span>
            <Textarea
              id="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context, applied to every file in this upload"
            />
          </Field>
        </FormGrid>
        {entityType && entityId ? (
          <p className="text-xs text-[var(--fg-subtle)]">
            These files will be attached to the {entityType} you came from.
          </p>
        ) : null}
      </FormSection>

      <FormActions>
        <Button asChild variant="ghost">
          <Link href="/knowledge">Done</Link>
        </Button>
        <Button type="submit" variant="primary" loading={pending} disabled={!files.length}>
          <Upload /> Upload {files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : ''}
        </Button>
      </FormActions>

      {results.length ? (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm font-medium">Uploaded</p>
            {results.map((r) => (
              <div key={r.id} className="rounded-lg border border-[var(--border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/knowledge/documents/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="flex items-center gap-1.5">
                    {r.textStatus === 'extracted' ? (
                      <Badge tone="success">
                        <CheckCircle2 className="size-3" /> Text extracted
                      </Badge>
                    ) : (
                      <Badge tone="warning">
                        <TriangleAlert className="size-3" /> Not searchable
                      </Badge>
                    )}
                    {r.aiStatus === 'ready' ? <Badge tone="accent">Summarised</Badge> : null}
                  </div>
                </div>
                {r.summary ? (
                  <p className="mt-2 text-sm text-[var(--fg-muted)]">{r.summary}</p>
                ) : null}
                {r.warning ? (
                  <p className="mt-2 text-xs text-[var(--warning)]">{r.warning}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </form>
  );
}
