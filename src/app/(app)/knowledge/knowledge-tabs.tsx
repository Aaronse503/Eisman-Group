'use client';
import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText, FolderOpen, Sparkles, StickyNote, TriangleAlert } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { EmptyState } from '@/components/ui/states';
import { formatNumber, titleCase, truncate } from '@/lib/utils';
import { fmtRelative } from '@/lib/dates';
import type { DocumentRow } from '@/lib/queries/knowledge';

interface NoteRow {
  id: string; company_id: string; company_name: string; title: string; body: string;
  entity_type: string | null; entity_id: string | null; pinned: boolean;
  author_name: string | null; created_at: Date; updated_at: Date; is_demo: boolean;
}

const ACCESS_TONE: Record<string, 'neutral' | 'warning' | 'danger' | 'accent'> = {
  company: 'neutral',
  finance: 'warning',
  investor: 'warning',
  hr: 'warning',
  restricted: 'danger',
};

export function KnowledgeTabs({
  defaultTab,
  documents,
  notes,
  folders,
  canWrite,
  showCompany,
  scopeSlug,
}: {
  defaultTab: string;
  documents: DocumentRow[];
  notes: NoteRow[];
  folders: { id: string; company_name: string; name: string; description: string | null; document_count: number }[];
  canWrite: boolean;
  showCompany: boolean;
  scopeSlug: string;
}) {
  const columns = React.useMemo<ColumnDef<DocumentRow, unknown>[]>(() => {
    const cols: ColumnDef<DocumentRow, unknown>[] = [
      {
        id: 'name',
        header: 'Document',
        accessorKey: 'name',
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link href={`/knowledge/documents/${row.original.id}`} className="font-medium hover:text-[var(--accent)] hover:underline">
              {row.original.name}
            </Link>
            {row.original.summary ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-[var(--fg-subtle)]">
                {truncate(row.original.summary, 120)}
              </p>
            ) : null}
          </div>
        ),
      },
      { id: 'folder_name', header: 'Folder', accessorKey: 'folder_name', cell: ({ row }) => row.original.folder_name ?? '—' },
      {
        id: 'text_status',
        header: 'Searchable',
        accessorKey: 'text_status',
        cell: ({ row }) =>
          row.original.text_status === 'extracted' ? (
            <Badge tone="success">Indexed</Badge>
          ) : row.original.text_status === 'unsupported' ? (
            <Badge tone="warning" title={row.original.text_error ?? ''}>
              <TriangleAlert className="size-3" /> Needs OCR
            </Badge>
          ) : row.original.text_status === 'failed' ? (
            <Badge tone="danger" title={row.original.text_error ?? ''}>Failed</Badge>
          ) : (
            <Badge tone="neutral">Pending</Badge>
          ),
      },
      {
        id: 'ai_status',
        header: 'Summary',
        accessorKey: 'ai_status',
        cell: ({ row }) =>
          row.original.ai_status === 'ready' ? (
            <Badge tone="accent" title={`${row.original.ai_provider} · ${row.original.ai_model}`}>
              <Sparkles className="size-3" /> Ready
            </Badge>
          ) : (
            <span className="text-xs text-[var(--fg-subtle)]">{titleCase(row.original.ai_status)}</span>
          ),
      },
      {
        id: 'access_level',
        header: 'Access',
        accessorKey: 'access_level',
        cell: ({ row }) => (
          <Badge tone={ACCESS_TONE[row.original.access_level] ?? 'neutral'}>
            {titleCase(row.original.access_level)}
          </Badge>
        ),
      },
      {
        id: 'byte_size',
        header: 'Size',
        accessorKey: 'byte_size',
        cell: ({ row }) => (
          <span className="tnum text-sm">{formatNumber(Math.max(1, Math.round(row.original.byte_size / 1024)))} KB</span>
        ),
      },
      { id: 'version', header: 'Version', accessorKey: 'version', cell: ({ row }) => `v${row.original.version}` },
      { id: 'uploaded_by', header: 'Uploaded by', accessorKey: 'uploaded_by', cell: ({ row }) => row.original.uploaded_by ?? '—' },
      { id: 'updated_at', header: 'Updated', accessorKey: 'updated_at', cell: ({ row }) => fmtRelative(row.original.updated_at) },
    ];
    if (showCompany) cols.splice(1, 0, { id: 'company_name', header: 'Company', accessorKey: 'company_name' });
    return cols;
  }, [showCompany]);

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
        <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
        <TabsTrigger value="folders">Folders ({folders.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="documents">
        <DataTable
          data={documents}
          columns={columns}
          searchPlaceholder="Search documents by name, summary or content…"
          exportFilename="documents"
          initialSorting={[{ id: 'updated_at', desc: true }]}
          emptyTitle="No documents yet"
          emptyDescription="Upload contracts, decks, reports and research. Readable files are summarised and indexed automatically."
          emptyAction={
            canWrite ? (
              <Button asChild variant="primary" size="sm">
                <Link href="/knowledge/upload">Upload a document</Link>
              </Button>
            ) : null
          }
        />
      </TabsContent>

      <TabsContent value="notes">
        {notes.length === 0 ? (
          <EmptyState
            icon={StickyNote}
            title="No notes yet"
            description="Notes written on clients, partnerships and investors appear here and feed the assistant."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {notes.map((note) => (
              <Card key={note.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="min-w-0">
                      <Link href={`/knowledge/notes/${note.id}`} className="hover:text-[var(--accent)] hover:underline">
                        {note.title}
                      </Link>
                    </CardTitle>
                    <div className="flex shrink-0 gap-1">
                      {note.pinned ? <Badge tone="gold">Pinned</Badge> : null}
                      {note.is_demo ? <Badge tone="gold">Demo</Badge> : null}
                    </div>
                  </div>
                  <p className="text-xs text-[var(--fg-subtle)]">
                    {note.author_name ?? 'Unknown'} · {fmtRelative(note.updated_at)}
                    {showCompany ? ` · ${note.company_name}` : ''}
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-4 text-sm whitespace-pre-wrap text-[var(--fg-muted)]">{note.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="folders">
        {folders.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No folders" description="Folders are created with each company." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((folder) => (
              <Card key={folder.id}>
                <CardContent className="flex items-start gap-3 pt-5">
                  <FolderOpen className="mt-0.5 size-5 shrink-0 text-[var(--gold)]" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/knowledge?tab=documents&folder=${folder.id}${scopeSlug === 'holdings' ? '' : `&company=${scopeSlug}`}`}
                      className="font-medium hover:text-[var(--accent)] hover:underline"
                    >
                      {folder.name}
                    </Link>
                    <p className="text-xs text-[var(--fg-subtle)]">
                      {folder.company_name} · {folder.document_count} document
                      {folder.document_count === 1 ? '' : 's'}
                    </p>
                    {folder.description ? (
                      <p className="mt-1 text-xs text-[var(--fg-muted)]">{folder.description}</p>
                    ) : null}
                  </div>
                  <FileText className="size-4 shrink-0 text-[var(--fg-subtle)]" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
