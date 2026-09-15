'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, X } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { Field, FormGrid } from '@/components/form';
import { EmptyState } from '@/components/ui/states';
import { formatNumber, titleCase } from '@/lib/utils';
import { fmtDate } from '@/lib/dates';
import { addMetricAnnotationAction, upsertParfaxMetricAction } from '@/server/actions/parfax';

interface MetricRow {
  id: string; metric_key: string; period_start: string; period_end: string;
  value: number; unit: string | null; kind: string; source_label: string;
  note: string | null; created_by: string | null; is_demo: boolean; updated_at: Date;
}

interface AnnotationRow {
  id: string; metric_key: string | null; occurred_on: string; title: string;
  body: string | null; created_by: string | null;
}

const KIND_TONE: Record<string, 'success' | 'info' | 'neutral' | 'warning' | 'gold'> = {
  raw: 'success',
  calculated: 'info',
  manual: 'neutral',
  forecast: 'warning',
  target: 'gold',
};

const KIND_LABEL: Record<string, string> = {
  raw: 'Production data',
  calculated: 'Calculated',
  manual: 'Manual entry',
  forecast: 'Forecast',
  target: 'Target',
  demo: 'Demo data',
};

const METRIC_KEYS = ['mrr', 'arr', 'registered_users', 'active_users', 'scans', 'scan_accuracy', 'churn_rate', 'marketplace_gmv'];

export function MetricsAdmin({
  metrics,
  annotations,
  canEdit,
}: {
  metrics: MetricRow[];
  annotations: AnnotationRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [annotationOpen, setAnnotationOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [form, setForm] = React.useState({
    metricKey: 'mrr',
    periodStart: '',
    periodEnd: '',
    value: '',
    unit: 'USD',
    kind: 'target',
    sourceLabel: '',
    note: '',
  });
  const [annotation, setAnnotation] = React.useState({
    metricKey: '',
    occurredOn: new Date().toISOString().slice(0, 10),
    title: '',
    body: '',
  });

  const columns = React.useMemo<ColumnDef<MetricRow, unknown>[]>(
    () => [
      { id: 'metric_key', header: 'Metric', accessorKey: 'metric_key', cell: ({ row }) => <span className="font-medium">{titleCase(row.original.metric_key)}</span> },
      {
        id: 'kind',
        header: 'Provenance',
        accessorKey: 'kind',
        cell: ({ row }) => (
          <Badge tone={row.original.is_demo ? 'gold' : (KIND_TONE[row.original.kind] ?? 'neutral')}>
            {row.original.is_demo ? 'Demo data' : (KIND_LABEL[row.original.kind] ?? row.original.kind)}
          </Badge>
        ),
      },
      {
        id: 'period',
        header: 'Period',
        accessorFn: (row) => row.period_start,
        cell: ({ row }) => `${fmtDate(row.original.period_start, 'MMM yyyy')}`,
      },
      {
        id: 'value',
        header: 'Value',
        accessorKey: 'value',
        cell: ({ row }) => (
          <span className="tnum">
            {formatNumber(row.original.value)}
            {row.original.unit ? <span className="ml-1 text-xs text-[var(--fg-subtle)]">{row.original.unit}</span> : null}
          </span>
        ),
      },
      { id: 'source_label', header: 'Source', accessorKey: 'source_label' },
      { id: 'created_by', header: 'Entered by', accessorKey: 'created_by', cell: ({ row }) => row.original.created_by ?? '—' },
      { id: 'note', header: 'Note', accessorKey: 'note', cell: ({ row }) => row.original.note ?? '—' },
    ],
    [],
  );

  return (
    <Tabs defaultValue="values">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <TabsList className="w-auto">
          <TabsTrigger value="values">Values ({metrics.length})</TabsTrigger>
          <TabsTrigger value="annotations">Annotations ({annotations.length})</TabsTrigger>
        </TabsList>
        {canEdit ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAnnotationOpen((v) => !v)}>
              {annotationOpen ? <X /> : <Plus />} Annotation
            </Button>
            <Button variant="primary" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? <X /> : <Plus />} Record a value
            </Button>
          </div>
        ) : null}
      </div>

      <TabsContent value="values">
        {open ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Record a target, forecast or manual figure</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setPending(true);
                  const result = await upsertParfaxMetricAction(form);
                  setPending(false);
                  if (result.ok) {
                    toast.success('Recorded');
                    setOpen(false);
                    router.refresh();
                  } else toast.error(result.error);
                }}
                className="space-y-4"
              >
                <FormGrid>
                  <Field label="Metric" htmlFor="metricKey" required>
                    <NativeSelect
                      id="metricKey"
                      value={form.metricKey}
                      onChange={(e) => setForm((f) => ({ ...f, metricKey: e.target.value }))}
                    >
                      {METRIC_KEYS.map((k) => (
                        <option key={k} value={k}>{titleCase(k)}</option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field
                    label="Provenance"
                    htmlFor="kind"
                    required
                    hint="Production and calculated values cannot be entered by hand."
                  >
                    <NativeSelect
                      id="kind"
                      value={form.kind}
                      onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
                    >
                      <option value="target">Target</option>
                      <option value="forecast">Forecast</option>
                      <option value="manual">Manual (historical backfill)</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Period start" htmlFor="periodStart" required>
                    <Input
                      id="periodStart"
                      type="date"
                      value={form.periodStart}
                      onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Period end" htmlFor="periodEnd" required>
                    <Input
                      id="periodEnd"
                      type="date"
                      value={form.periodEnd}
                      onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Value" htmlFor="value" required>
                    <Input
                      id="value"
                      type="number"
                      step="0.0001"
                      value={form.value}
                      onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Unit" htmlFor="unit">
                    <Input
                      id="unit"
                      value={form.unit}
                      onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                      placeholder="USD, users, scans…"
                    />
                  </Field>
                  <Field
                    label="Where this number came from"
                    htmlFor="sourceLabel"
                    required
                    hint="Shown on every chart that uses this value."
                    span
                  >
                    <Input
                      id="sourceLabel"
                      value={form.sourceLabel}
                      onChange={(e) => setForm((f) => ({ ...f, sourceLabel: e.target.value }))}
                      placeholder="e.g. Board target — 2026 operating plan"
                      required
                    />
                  </Field>
                  <Field label="Note" htmlFor="note" span>
                    <Textarea
                      id="note"
                      rows={2}
                      value={form.note}
                      onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                    />
                  </Field>
                </FormGrid>
                <Button type="submit" variant="primary" loading={pending}>
                  Record value
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <DataTable
          data={metrics}
          columns={columns}
          searchPlaceholder="Search metrics…"
          exportFilename="parfax-metrics"
          initialSorting={[{ id: 'period', desc: true }]}
          emptyTitle="No stored metric values"
          emptyDescription="Targets, forecasts and historical backfills appear here alongside their provenance."
        />
      </TabsContent>

      <TabsContent value="annotations">
        {annotationOpen ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Add a reporting annotation</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setPending(true);
                  const result = await addMetricAnnotationAction(annotation);
                  setPending(false);
                  if (result.ok) {
                    toast.success('Annotation added');
                    setAnnotationOpen(false);
                    setAnnotation({ metricKey: '', occurredOn: new Date().toISOString().slice(0, 10), title: '', body: '' });
                    router.refresh();
                  } else toast.error(result.error);
                }}
                className="space-y-4"
              >
                <FormGrid>
                  <Field label="Metric" htmlFor="annotation-metric" hint="Leave blank to annotate all charts.">
                    <NativeSelect
                      id="annotation-metric"
                      value={annotation.metricKey}
                      onChange={(e) => setAnnotation((a) => ({ ...a, metricKey: e.target.value }))}
                    >
                      <option value="">All metrics</option>
                      {METRIC_KEYS.map((k) => (
                        <option key={k} value={k}>{titleCase(k)}</option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Date" htmlFor="annotation-date" required>
                    <Input
                      id="annotation-date"
                      type="date"
                      value={annotation.occurredOn}
                      onChange={(e) => setAnnotation((a) => ({ ...a, occurredOn: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Title" htmlFor="annotation-title" required span>
                    <Input
                      id="annotation-title"
                      value={annotation.title}
                      onChange={(e) => setAnnotation((a) => ({ ...a, title: e.target.value }))}
                      placeholder="e.g. Pro plan price change"
                      required
                    />
                  </Field>
                  <Field label="Detail" htmlFor="annotation-body" span>
                    <Textarea
                      id="annotation-body"
                      rows={2}
                      value={annotation.body}
                      onChange={(e) => setAnnotation((a) => ({ ...a, body: e.target.value }))}
                    />
                  </Field>
                </FormGrid>
                <Button type="submit" variant="primary" loading={pending}>
                  Add annotation
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {annotations.length === 0 ? (
          <EmptyState
            title="No annotations"
            description="Annotations explain why a line moved — a price change, a press feature, an outage."
          />
        ) : (
          <div className="space-y-2">
            {annotations.map((a) => (
              <Card key={a.id}>
                <CardContent className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{a.title}</span>
                    <div className="flex items-center gap-2">
                      {a.metric_key ? <Badge tone="outline">{titleCase(a.metric_key)}</Badge> : <Badge tone="neutral">All metrics</Badge>}
                      <span className="text-xs text-[var(--fg-subtle)]">{fmtDate(a.occurred_on)}</span>
                    </div>
                  </div>
                  {a.body ? <p className="mt-1 text-sm text-[var(--fg-muted)]">{a.body}</p> : null}
                  {a.created_by ? (
                    <p className="mt-1 text-xs text-[var(--fg-subtle)]">Added by {a.created_by}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
