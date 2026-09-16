import * as React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiClientError } from '@eisman/api-client';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';
import { Body, Button, ErrorNote, Field, Screen } from '@/components/ui';
import { CompanyPicker } from '@/components/company-picker';

/**
 * A meeting.
 *
 * Unlike a task or a note, this one is not queued when offline: a meeting has
 * participants who need to be told, and quietly holding it on a phone would be
 * worse than saying plainly that it needs a connection.
 */
export default function CreateMeetingScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [startsAt, setStartsAt] = React.useState(() => {
    const next = new Date(Date.now() + 3600_000);
    next.setMinutes(0, 0, 0);
    return next.toISOString().slice(0, 16);
  });
  const [durationMinutes, setDurationMinutes] = React.useState('30');
  const [agenda, setAgenda] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Give the meeting a title.');
      return;
    }
    if (!companyId) {
      setError('Choose a company.');
      return;
    }
    const start = new Date(startsAt);
    if (Number.isNaN(start.getTime())) {
      setError('Enter the start as YYYY-MM-DD HH:MM.');
      return;
    }
    const minutes = Number(durationMinutes) || 30;

    setBusy(true);
    try {
      await api.createMeeting({
        companyId,
        title: title.trim(),
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
        agenda: agenda.trim() || undefined,
        status: 'scheduled',
      });
      router.back();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.isOffline
            ? 'No connection. A meeting needs one, so that everyone invited hears about it.'
            : err.message
          : 'Could not create that meeting.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: theme.spacing.lg }}>
        {error ? <ErrorNote message={error} /> : null}
        <CompanyPicker value={companyId} onChange={setCompanyId} permission="calendar:write" />
        <Field label="Title" value={title} onChangeText={setTitle} autoFocus />
        <Field
          label="Starts"
          value={startsAt}
          onChangeText={setStartsAt}
          placeholder="2026-09-20T14:00"
          autoCapitalize="none"
        />
        <Field
          label="Minutes"
          value={durationMinutes}
          onChangeText={setDurationMinutes}
          keyboardType="numeric"
        />
        <Field label="Agenda" value={agenda} onChangeText={setAgenda} multiline />
        <Button label="Create meeting" onPress={submit} loading={busy} icon="calendar-outline" />
        <Body subtle size="sm">
          Participants and conference links are added on the desktop, where there is room to do it.
        </Body>
      </View>
    </Screen>
  );
}
