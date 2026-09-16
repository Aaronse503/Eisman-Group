import * as React from 'react';
import { RefreshControl, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fmtDate, describeRecurrence } from '@eisman/shared';
import { ApiClientError } from '@eisman/api-client';
import { api } from '@/lib/api';
import { enqueue } from '@/lib/offline';
import { useSession } from '@/lib/session';
import { useQuery } from '@/lib/use-query';
import { useTheme } from '@/theme';
import {
  Badge,
  Body,
  Button,
  Card,
  DemoBadge,
  ErrorNote,
  Heading,
  Loading,
  Row,
  Screen,
  SectionTitle,
} from '@/components/ui';

export default function TaskScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refreshQueueCount } = useSession();

  const detail = useQuery(`task.${id}`, () => api.task(id!), [id]);
  const task = detail.data?.task;
  const [note, setNote] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const complete = async () => {
    setBusy(true);
    setNote(null);
    try {
      await api.completeTask(id!);
      router.back();
    } catch (err) {
      if (err instanceof ApiClientError && err.isOffline) {
        await enqueue('task.complete', { id });
        await refreshQueueCount();
        setNote('Saved on this device. It will be marked done when you are back online.');
      } else {
        setNote(err instanceof ApiClientError ? err.message : 'Could not mark that done.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={detail.refreshing}
          onRefresh={() => void detail.refresh()}
          tintColor={theme.colors.accent}
        />
      }
    >
      {detail.loading && !detail.data ? <Loading /> : null}
      {detail.error && !detail.data ? <ErrorNote message={detail.error} /> : null}

      {task ? (
        <>
          <Row gap={8} wrap>
            <Heading>{String(task.title)}</Heading>
            <DemoBadge show={task.isDemo} />
          </Row>

          <Row gap={6} wrap style={{ marginTop: theme.spacing.md }}>
            <Badge tone={task.status === 'done' ? 'success' : 'neutral'}>{String(task.status)}</Badge>
            <Badge tone="neutral">{String(task.priority)}</Badge>
            {task.dueAt ? <Badge tone="info">Due {fmtDate(String(task.dueAt))}</Badge> : null}
          </Row>

          {task.description ? (
            <Card style={{ marginTop: theme.spacing.lg }}>
              <Body>{String(task.description)}</Body>
            </Card>
          ) : null}

          <Card style={{ marginTop: theme.spacing.md }}>
            {[
              ['Company', task.companyName],
              ['Client', task.clientName],
              ['Assigned to', task.assigneeName],
              ['Repeats', describeRecurrence((task.recurrenceRule as string | null) ?? null)],
            ]
              .filter(([, value]) => Boolean(value))
              .map(([label, value], index) => (
                <Row key={String(label)} justify="space-between" style={{ marginTop: index === 0 ? 0 : theme.spacing.sm }}>
                  <Body muted size="sm">
                    {String(label)}
                  </Body>
                  <Body>{String(value)}</Body>
                </Row>
              ))}
          </Card>

          {detail.data?.subtasks.length ? (
            <>
              <SectionTitle>Subtasks</SectionTitle>
              <Card style={{ padding: 0 }}>
                {detail.data.subtasks.map((subtask, index) => (
                  <Row
                    key={subtask.id}
                    gap={theme.spacing.md}
                    style={{
                      padding: theme.spacing.lg,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: theme.colors.border,
                    }}
                  >
                    <Ionicons
                      name={subtask.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                      color={subtask.status === 'done' ? theme.colors.success : theme.colors.fgSubtle}
                    />
                    <View style={{ flex: 1 }}>
                      <Body>{subtask.title}</Body>
                      {subtask.dueAt ? (
                        <Body subtle size="sm">
                          Due {fmtDate(subtask.dueAt)}
                        </Body>
                      ) : null}
                    </View>
                  </Row>
                ))}
              </Card>
            </>
          ) : null}

          {note ? (
            <Body size="sm" muted style={{ marginTop: theme.spacing.md }}>
              {note}
            </Body>
          ) : null}

          {task.status !== 'done' ? (
            <Button
              label="Mark done"
              icon="checkmark-circle-outline"
              loading={busy}
              onPress={complete}
              style={{ marginTop: theme.spacing.lg }}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
