import * as React from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fmtDate } from '@eisman/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useQuery } from '@/lib/use-query';
import { useTheme } from '@/theme';
import { enqueue } from '@/lib/offline';
import { ApiClientError } from '@eisman/api-client';
import {
  Badge,
  Body,
  Card,
  DemoBadge,
  EmptyState,
  ErrorNote,
  Loading,
  Row,
  Screen,
  SourceNote,
} from '@/components/ui';
import { SyncBanner } from '@/components/sync-banner';

const VIEWS = [
  { id: 'my', label: 'Mine' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'delegated', label: 'Delegated' },
  { id: 'all', label: 'All' },
] as const;

export default function TasksScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { scope, refreshQueueCount } = useSession();
  const [view, setView] = React.useState<string>('my');
  const [completing, setCompleting] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const tasks = useQuery(
    `tasks.${scope}.${view}`,
    () => api.tasks({ company: scope, view }),
    [scope, view],
  );

  const complete = async (id: string, title: string) => {
    setCompleting(id);
    setNote(null);
    try {
      await api.completeTask(id);
      setNote(`“${title}” marked done.`);
      await tasks.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.isOffline) {
        // No connection: queue it and say so, rather than pretending.
        await enqueue('task.complete', { id });
        await refreshQueueCount();
        setNote(`Saved on this device. “${title}” will be marked done when you are back online.`);
      } else {
        setNote(err instanceof ApiClientError ? err.message : 'Could not mark that done.');
      }
    } finally {
      setCompleting(null);
    }
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={tasks.refreshing}
          onRefresh={() => void tasks.refresh()}
          tintColor={theme.colors.accent}
        />
      }
    >
      <SyncBanner />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: theme.spacing.md }}
      >
        {VIEWS.map((option) => {
          const active = option.id === view;
          return (
            <Pressable
              key={option.id}
              onPress={() => setView(option.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${option.label} tasks`}
              style={{
                minHeight: theme.minTouchTarget,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.lg,
                borderRadius: theme.radius.pill,
                backgroundColor: active ? theme.colors.accentSoft : theme.colors.surface,
                borderWidth: 1,
                borderColor: active ? theme.colors.accent : theme.colors.border,
              }}
            >
              <Body
                size="sm"
                style={{
                  fontWeight: '600',
                  color: active ? theme.colors.accentSoftFg : theme.colors.fgMuted,
                }}
              >
                {option.label}
              </Body>
            </Pressable>
          );
        })}
      </ScrollView>

      {note ? (
        <View style={{ marginBottom: theme.spacing.md }}>
          <Body size="sm" muted>
            {note}
          </Body>
        </View>
      ) : null}

      {tasks.loading && !tasks.data ? <Loading label="Loading tasks" /> : null}
      {tasks.error && !tasks.data ? <ErrorNote message={tasks.error} /> : null}

      {tasks.data?.items.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description="No tasks in this view."
          icon="checkmark-done-outline"
        />
      ) : null}

      <View style={{ gap: theme.spacing.md }}>
        {tasks.data?.items.map((task) => (
          <Card
            key={task.id}
            onPress={() => router.push(`/task/${task.id}`)}
            accessibilityLabel={`${task.title}. ${task.isOverdue ? 'Overdue. ' : ''}Open task`}
          >
            <Row align="flex-start" gap={theme.spacing.md}>
              <Pressable
                onPress={() => void complete(task.id, task.title)}
                disabled={completing === task.id || task.status === 'done'}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.status === 'done' }}
                accessibilityLabel={`Mark ${task.title} as done`}
                hitSlop={12}
                style={{ minWidth: 28, minHeight: 28, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons
                  name={task.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={task.status === 'done' ? theme.colors.success : theme.colors.fgSubtle}
                />
              </Pressable>

              <View style={{ flex: 1, gap: 4 }}>
                <Body style={{ fontWeight: '600' }}>{task.title}</Body>
                <Row gap={6} wrap>
                  {task.dueAt ? (
                    <Badge tone={task.isOverdue ? 'danger' : 'neutral'}>
                      {task.isOverdue ? 'Overdue · ' : ''}
                      {fmtDate(task.dueAt)}
                    </Badge>
                  ) : null}
                  {task.priority === 'high' || task.priority === 'urgent' ? (
                    <Badge tone="warning">{task.priority}</Badge>
                  ) : null}
                  {task.subtaskCount > 0 ? (
                    <Badge tone="neutral">
                      {task.subtasksDone}/{task.subtaskCount} subtasks
                    </Badge>
                  ) : null}
                  <DemoBadge show={task.isDemo} />
                </Row>
                <Body subtle size="sm">
                  {[task.clientName, task.companyName, task.assigneeName].filter(Boolean).join(' · ')}
                </Body>
              </View>
            </Row>
          </Card>
        ))}
      </View>

      {tasks.data ? (
        <SourceNote source="Tasks in this system" stale={tasks.stale} at={tasks.fetchedAt} />
      ) : null}
    </Screen>
  );
}
