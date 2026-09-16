import * as React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ApiClientError } from '@eisman/api-client';
import { api } from '@/lib/api';
import { enqueue } from '@/lib/offline';
import { useSession } from '@/lib/session';
import { useQuery } from '@/lib/use-query';
import { useTheme } from '@/theme';
import { Body, Button, ErrorNote, Field, Loading, Screen } from '@/components/ui';
import { DictateButton } from '@/components/dictation';
import { RecordPicker } from '@/components/record-picker';

/**
 * A note against a client, partnership, investor or meeting.
 *
 * Can be dictated. A note with nowhere to live is refused rather than being
 * saved somewhere arbitrary, because an unattached note is one nobody finds
 * again.
 */
export default function CreateNoteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ entityType?: string; entityId?: string; label?: string }>();
  const { scope, refreshQueueCount } = useSession();

  const [entity, setEntity] = React.useState<{ type: string; id: string; label: string } | null>(
    params.entityType && params.entityId
      ? { type: params.entityType, id: params.entityId, label: params.label ?? 'Selected record' }
      : null,
  );
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [queued, setQueued] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const clients = useQuery(`clients.${scope}.picker`, () => api.clients({ company: scope }), [scope]);

  const submit = async () => {
    setError(null);
    if (!entity) {
      setError('Choose the record this note belongs to.');
      return;
    }
    if (!title.trim()) {
      setError('Give the note a title.');
      return;
    }

    const payload = {
      entityType: entity.type,
      entityId: entity.id,
      title: title.trim(),
      body: body.trim(),
      pinned: false,
    };

    setBusy(true);
    try {
      await api.createNote(payload);
      router.back();
    } catch (err) {
      if (err instanceof ApiClientError && err.isOffline) {
        await enqueue('note.create', payload);
        await refreshQueueCount();
        setQueued(true);
      } else {
        setError(err instanceof ApiClientError ? err.message : 'Could not save that note.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (queued) {
    return (
      <Screen>
        <View style={{ gap: theme.spacing.md }}>
          <Body style={{ fontWeight: '600' }}>Saved on this device</Body>
          <Body muted>
            “{title.trim()}” is waiting to send, and will reach {entity?.label} as soon as you have a
            connection.
          </Body>
          <Button label="Done" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: theme.spacing.lg }}>
        {error ? <ErrorNote message={error} /> : null}

        {clients.loading && !clients.data ? (
          <Loading label="Loading records" />
        ) : (
          <RecordPicker
            label="Attach to"
            value={entity}
            options={(clients.data?.items ?? []).map((client) => ({
              type: 'client',
              id: client.id,
              label: client.name,
            }))}
            onChange={setEntity}
          />
        )}

        <Field label="Title" value={title} onChangeText={setTitle} placeholder="What is this note about?" />
        <Field
          label="Note"
          value={body}
          onChangeText={setBody}
          multiline
          placeholder="Type, or dictate below"
        />
        <DictateButton
          label="Dictate this note"
          onText={(text) => setBody((current) => (current ? `${current} ${text}` : text))}
        />
        <Button label="Save note" onPress={submit} loading={busy} icon="save-outline" />
      </View>
    </Screen>
  );
}
