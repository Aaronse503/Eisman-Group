'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, CheckCircle2, FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { autoMap, parseCsv, validateRows, type ImportField } from '@/lib/csv/import';
import { runImportAction, type ImportSummary } from '@/server/actions/import';
import { cn, formatNumber, truncate } from '@/lib/utils';

interface EntityView {
  id: string;
  label: string;
  description: string;
  companyScoped: boolean;
  duplicateKeys: string[];
  fields: ImportField[];
}

type Step = 'upload' | 'map' | 'preview' | 'done';

export function ImportWizard({
  entities,
  companies,
  defaultEntityId,
  defaultCompanyId,
}: {
  entities: EntityView[];
  companies: { id: string; name: string }[];
  defaultEntityId: string;
  defaultCompanyId: string;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>('upload');
  const [entityId, setEntityId] = React.useState(defaultEntityId);
  const [companyId, setCompanyId] = React.useState(defaultCompanyId);
  const [filename, setFilename] = React.useState('');
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [strategy, setStrategy] = React.useState<'skip' | 'update' | 'create_anyway'>('skip');
  const [parseErrors, setParseErrors] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const entity = entities.find((e) => e.id === entityId);

  const validation = React.useMemo(() => {
    if (!entity || !rows.length) return { issues: [], valid: [] };
    return validateRows(
      { ...entity, table: '', permission: 'crm:write' as const },
      rows,
      mapping,
    );
  }, [entity, rows, mapping]);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    setFilename(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setParseErrors(parsed.errors);
    if (entity) setMapping(autoMap({ ...entity, table: '', permission: 'crm:write' }, parsed.headers));
    setStep('map');
  };

  const reset = () => {
    setStep('upload');
    setFilename('');
    setHeaders([]);
    setRows([]);
    setMapping({});
    setParseErrors([]);
    setSummary(null);
  };

  if (!entities.length) {
    return <EmptyState title="Nothing you can import" description="Your role does not allow importing any record type." />;
  }

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {(['upload', 'map', 'preview', 'done'] as Step[]).map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                step === s
                  ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                  : 'bg-[var(--surface-sunken)] text-[var(--fg-subtle)]',
              )}
            >
              {i + 1}
            </span>
            <span className={step === s ? 'font-medium' : 'text-[var(--fg-subtle)]'}>
              {{ upload: 'Upload', map: 'Map columns', preview: 'Preview', done: 'Done' }[s]}
            </span>
            {i < 3 ? <ArrowRight className="size-3.5 text-[var(--fg-subtle)]" /> : null}
          </li>
        ))}
      </ol>

      {step === 'upload' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="import-entity">What are you importing?</Label>
              <NativeSelect id="import-entity" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.label}</option>
                ))}
              </NativeSelect>
              {entity ? <p className="text-xs text-[var(--fg-subtle)]">{entity.description}</p> : null}
            </div>
            {entity?.companyScoped ? (
              <div className="space-y-1.5">
                <Label htmlFor="import-company">Into which company?</Label>
                <NativeSelect id="import-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-sunken)]/50 px-6 py-10 text-center"
          >
            <FileUp className="size-7 text-[var(--fg-subtle)]" />
            <p className="text-sm font-medium">Drop a CSV file here</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              Choose a file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Choose a CSV file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>

          {entity ? (
            <div className="rounded-lg bg-[var(--surface-sunken)] p-3 text-xs">
              <p className="mb-1 font-medium">Columns this import understands</p>
              <div className="flex flex-wrap gap-1">
                {entity.fields.map((f) => (
                  <Badge key={f.key} tone={f.required ? 'accent' : 'neutral'}>
                    {f.label}
                    {f.required ? ' *' : ''}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-[var(--fg-subtle)]">
                Duplicates are matched on: {entity.duplicateKeys.join(', ')}.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 'map' && entity ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <strong>{filename}</strong> — {formatNumber(rows.length)} row
              {rows.length === 1 ? '' : 's'}, {headers.length} column{headers.length === 1 ? '' : 's'}
            </p>
            <Button variant="ghost" size="sm" onClick={reset}>
              Start over
            </Button>
          </div>

          {parseErrors.length ? (
            <div className="rounded-lg border border-[var(--warning)]/40 bg-[var(--warning-bg)] px-3 py-2 text-xs">
              <p className="font-medium">The file had {parseErrors.length} parse warning(s)</p>
              <ul className="mt-1 list-disc pl-4">
                {parseErrors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-2">
            {entity.fields.map((field) => (
              <div key={field.key} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[14rem_1fr]">
                <Label htmlFor={`map-${field.key}`} required={field.required}>
                  {field.label}
                  {field.hint ? (
                    <span className="mt-0.5 block text-[11px] font-normal text-[var(--fg-subtle)]">
                      {field.hint}
                    </span>
                  ) : null}
                </Label>
                <NativeSelect
                  id={`map-${field.key}`}
                  value={mapping[field.key] ?? ''}
                  onChange={(e) =>
                    setMapping((m) => {
                      const next = { ...m };
                      if (e.target.value) next[field.key] = e.target.value;
                      else delete next[field.key];
                      return next;
                    })
                  }
                >
                  <option value="">— not imported —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => setStep('preview')}
              disabled={entity.fields.some((f) => f.required && !mapping[f.key])}
            >
              Preview <ArrowRight />
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'preview' && entity ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--border)] p-3">
              <p className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">Rows in file</p>
              <p className="tnum text-xl font-semibold">{formatNumber(rows.length)}</p>
            </div>
            <div className="rounded-lg border border-[var(--success)]/40 p-3">
              <p className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">Will import</p>
              <p className="tnum text-xl font-semibold text-[var(--success)]">
                {formatNumber(validation.valid.length)}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--danger)]/40 p-3">
              <p className="text-[11px] tracking-wide text-[var(--fg-subtle)] uppercase">Will fail</p>
              <p className="tnum text-xl font-semibold text-[var(--danger)]">
                {formatNumber(new Set(validation.issues.map((i) => i.row)).size)}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="import-strategy">When a record already exists</Label>
            <NativeSelect
              id="import-strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as typeof strategy)}
              className="sm:max-w-sm"
            >
              <option value="skip">Skip it — leave the existing record untouched</option>
              <option value="update">Update it with the values from this file</option>
              <option value="create_anyway">Create a second record anyway</option>
            </NativeSelect>
            <p className="text-xs text-[var(--fg-subtle)]">
              Matched on {entity.duplicateKeys.join(', ')}.
              {strategy === 'update'
                ? ' Updated rows cannot be rolled back — the previous values are not snapshotted.'
                : ''}
            </p>
          </div>

          {validation.issues.length ? (
            <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-bg)] p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--danger)]">
                <AlertTriangle className="size-4" /> {validation.issues.length} problem(s) found
              </p>
              <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto text-xs">
                {validation.issues.slice(0, 40).map((issue, i) => (
                  <li key={i}>
                    Row {issue.row} · {issue.message}
                    {issue.value ? `: “${truncate(issue.value, 40)}”` : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--fg-muted)]">
                These rows are skipped. Everything else still imports.
              </p>
            </div>
          ) : null}

          {validation.valid.length ? (
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-[var(--surface-sunken)]">
                  <tr>
                    {entity.fields
                      .filter((f) => mapping[f.key])
                      .map((f) => (
                        <th key={f.key} scope="col" className="px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-[var(--fg-muted)] uppercase">
                          {f.label}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {validation.valid.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-[var(--border)]">
                      {entity.fields
                        .filter((f) => mapping[f.key])
                        .map((f) => (
                          <td key={f.key} className="px-3 py-2">
                            {row[f.key] instanceof Date
                              ? (row[f.key] as Date).toISOString().slice(0, 10)
                              : String(row[f.key] ?? '—')}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="bg-[var(--surface-sunken)] px-3 py-1.5 text-xs text-[var(--fg-subtle)]">
                Showing the first 5 of {formatNumber(validation.valid.length)} valid rows.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep('map')}>
              Back to mapping
            </Button>
            <Button
              variant="primary"
              loading={pending}
              disabled={!validation.valid.length}
              onClick={async () => {
                setPending(true);
                const result = await runImportAction({
                  entityId,
                  companyId: entity.companyScoped ? companyId : null,
                  filename,
                  mapping,
                  rows,
                  duplicateStrategy: strategy,
                });
                setPending(false);
                if (result.ok) {
                  setSummary(result.data);
                  setStep('done');
                  toast.success(`Imported ${result.data.created + result.data.updated} record(s)`);
                  router.refresh();
                } else toast.error(result.error);
              }}
            >
              <Upload /> Import {formatNumber(validation.valid.length)} record(s)
            </Button>
          </div>
        </div>
      ) : null}

      {step === 'done' && summary ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-[var(--success)]/40 bg-[var(--success-bg)] p-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--success)]" />
            <div>
              <p className="font-medium">Import complete</p>
              <p className="text-sm text-[var(--fg-muted)]">
                {summary.created} created · {summary.updated} updated · {summary.skipped} skipped ·{' '}
                {summary.failed} failed
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={reset}>
            Import another file
          </Button>
        </div>
      ) : null}
    </div>
  );
}
