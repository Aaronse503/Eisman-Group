'use client';
import * as React from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/states';

export interface KanbanColumn {
  id: string;
  title: string;
  description?: string;
  tone?: string;
}

export interface KanbanItem {
  id: string;
  columnId: string;
}

function Column({
  column,
  count,
  children,
  summary,
}: {
  column: KanbanColumn;
  count: number;
  children: React.ReactNode;
  summary?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.title}, ${count} items`}
      className={cn(
        'flex w-[17.5rem] shrink-0 flex-col rounded-[var(--radius-card)] border bg-[var(--surface-sunken)]/60 transition-colors',
        isOver ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{column.title}</h3>
          {summary ? <p className="truncate text-xs text-[var(--fg-subtle)]">{summary}</p> : null}
        </div>
        <span className="tnum rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-medium text-[var(--fg-muted)]">
          {count}
        </span>
      </header>
      <div className="flex max-h-[calc(100vh-20rem)] min-h-24 flex-col gap-2 overflow-y-auto p-2">
        {children}
      </div>
    </section>
  );
}

function DraggableCard({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn('touch-none', isDragging && 'opacity-40')}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}

export interface KanbanBoardProps<T extends KanbanItem> {
  columns: KanbanColumn[];
  items: T[];
  renderCard: (item: T) => React.ReactNode;
  onMove?: (itemId: string, toColumnId: string) => void | Promise<void>;
  columnSummary?: (columnId: string, items: T[]) => React.ReactNode;
  readOnly?: boolean;
  emptyMessage?: string;
}

/**
 * Drag-and-drop board used by the client CRM, deals, partnerships and the
 * investor pipeline. Movement is also possible with the keyboard (dnd-kit's
 * keyboard sensor), and the board degrades to read-only without `onMove`.
 */
export function KanbanBoard<T extends KanbanItem>({
  columns,
  items,
  renderCard,
  onMove,
  columnSummary,
  readOnly,
  emptyMessage = 'No records in this pipeline yet.',
}: KanbanBoardProps<T>) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const byColumn = React.useMemo(() => {
    const map = new Map<string, T[]>(columns.map((c) => [c.id, []]));
    for (const item of items) {
      const bucket = map.get(item.columnId);
      if (bucket) bucket.push(item);
    }
    return map;
  }, [columns, items]);

  const activeItem = items.find((i) => i.id === activeId) ?? null;

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const overId = event.over?.id ? String(event.over.id) : null;
    const itemId = String(event.active.id);
    if (!overId || readOnly) return;
    const item = items.find((i) => i.id === itemId);
    if (!item || item.columnId === overId) return;
    void onMove?.(itemId, overId);
  };

  if (items.length === 0) {
    return <EmptyState title="Empty pipeline" description={emptyMessage} />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
        {columns.map((column) => {
          const columnItems = byColumn.get(column.id) ?? [];
          return (
            <Column
              key={column.id}
              column={column}
              count={columnItems.length}
              summary={columnSummary?.(column.id, columnItems)}
            >
              {columnItems.map((item) => (
                <DraggableCard key={item.id} id={item.id} disabled={readOnly || !onMove}>
                  {renderCard(item)}
                </DraggableCard>
              ))}
              {columnItems.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-[var(--fg-subtle)]">Drop here</p>
              ) : null}
            </Column>
          );
        })}
      </div>
      <DragOverlay>{activeItem ? <div className="rotate-1">{renderCard(activeItem)}</div> : null}</DragOverlay>
    </DndContext>
  );
}
