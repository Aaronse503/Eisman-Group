import * as React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiClientError } from '@eisman/api-client';
import { api } from '@/lib/api';
import { enqueue } from '@/lib/offline';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { Body, Button, ErrorNote, Field, Screen } from '@/components/ui';
import { CompanyPicker } from '@/components/company-picker';

/**
 * A new task.
 *
 * With no connection the task is queued on the device and the person is told
 * so plainly, rather than being shown a success that has not happened.
 */
export default function CreateTaskScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { refreshQueueCount } = useSession();

  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [queued, setQueued] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Give the task a title.');
      return;
    }
    if (!companyId) {
      setError('Choose a company.');
      return;
    }

    const payload = {
      companyId,
      title: title.trim(),
      description: description.trim() || undefined,
      status: 'todo',
      priority: 'normal',
    };

    setBusy(true);
    try {
      await api.createTask(payload);
      router.back();
    } catch (err) {
      if (err instanceof ApiClientError && err.isOffline) {
        await enqueue('task.create', payload);
        await refreshQueueCount();
        setQueued(true);
      } else {
        setError(err instanceof ApiClientError ? err.message : 'Could not create that task.');
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
            “{title.trim()}” is waiting to send. It will reach the Command Center as soon as you
            have a connection, and you can see everything queued under Sync.
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
        <CompanyPicker value={companyId} onChange={setCompanyId} permission="task:write" />
        <Field label="Title" value={title} onChangeText={setTitle} autoFocus placeholder="What needs doing?" />
        <Field
          label="Notes"
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Anything worth remembering about it"
        />
        <Button label="Create task" onPress={submit} loading={busy} icon="add-circle-outline" />
      </View>
    </Screen>
  );
}
