import * as React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { QueuedMutation } from '@eisman/shared';
import { fmtDateTime } from '@eisman/shared';
import { clearFailed, readFailed, readQueue, type FailedMutation } from '@/lib/offline';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { Body, Button, Card, EmptyState, Row, Screen, SectionTitle } from '@/components/ui';

const KIND_LABEL: Record<QueuedMutation['kind'], string> = {
  'task.create': 'New task',
  'task.complete': 'Task marked done',
  'note.create': 'New note',
  'contact.create': 'New contact',
};

/**
 * What is waiting to send, and what the server refused.
 *
 * Nothing is hidden here: a change that failed stays visible with the reason
 * until somebody deals with it, because the alternative is a note that
 * silently never existed.
 */
export default function SyncScreen() {
  const theme = useTheme();
  const { sync, syncing, lastSync, refreshQueueCount } = useSession();
  const [queue, setQueue] = React.useState<QueuedMutation[]>([]);
  const [failed, setFailed] = React.useState<FailedMutation[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setQueue(await readQueue());
    setFailed(await readFailed());
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    setMessage(null);
    const result = await sync();
    await load();
    await refreshQueueCount();
    setMessage(
      result.offline
        ? 'Still no connection. Your changes are safe on this device.'
        : `${result.applied} sent${result.failed ? `, ${result.failed} refused` : ''}.`,
    );
  };

  return (
    <Screen>
      <Card>
        <Row justify="space-between">
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '600' }}>
              {queue.length === 0 ? 'Everything is saved' : `${queue.length} waiting to send`}
            </Body>
            <Body subtle size="sm">
              {lastSync ? `Last sent ${fmtDateTime(lastSync)}` : 'Not sent yet on this device'}
            </Body>
          </View>
          <Ionicons
            name={queue.length === 0 ? 'cloud-done-outline' : 'cloud-upload-outline'}
            size={26}
            color={queue.length === 0 ? theme.colors.success : theme.colors.warning}
          />
        </Row>
        {queue.length > 0 ? (
          <Button
            label="Send now"
            onPress={send}
            loading={syncing}
            icon="sync-outline"
            style={{ marginTop: theme.spacing.md }}
          />
        ) : null}
        {message ? (
          <Body size="sm" muted style={{ marginTop: theme.spacing.sm }}>
            {message}
          </Body>
        ) : null}
      </Card>

      {queue.length > 0 ? (
        <>
          <SectionTitle>Waiting</SectionTitle>
          <Card style={{ padding: 0 }}>
            {queue.map((mutation, index) => (
              <View
                key={mutation.clientId}
                style={{
                  padding: theme.spacing.lg,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <Body style={{ fontWeight: '600' }}>{KIND_LABEL[mutation.kind]}</Body>
                <Body subtle size="sm">
                  Written {fmtDateTime(mutation.createdAt)}
                </Body>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {failed.length > 0 ? (
        <>
          <SectionTitle>Refused</SectionTitle>
          <Card style={{ padding: 0 }}>
            {failed.map((mutation, index) => (
              <View
                key={mutation.clientId}
                style={{
                  padding: theme.spacing.lg,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.border,
                }}
              >
                <Body style={{ fontWeight: '600' }}>{KIND_LABEL[mutation.kind]}</Body>
                <Body size="sm" style={{ color: theme.colors.danger }}>
                  {mutation.error}
                </Body>
                <Body subtle size="sm">
                  Written {fmtDateTime(mutation.createdAt)}
                </Body>
              </View>
            ))}
          </Card>
          <Button
            label="Clear the refused list"
            variant="ghost"
            onPress={async () => {
              await clearFailed();
              await load();
            }}
            style={{ marginTop: theme.spacing.md }}
          />
        </>
      ) : null}

      {queue.length === 0 && failed.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          description="Anything you write without a connection will appear here until it sends."
          icon="cloud-done-outline"
        />
      ) : null}
    </Screen>
  );
}
