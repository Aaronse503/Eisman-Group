import * as React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ApiClientError } from '@eisman/api-client';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';
import { Body, Button, ErrorNote, Field, Screen } from '@/components/ui';
import { CompanyPicker } from '@/components/company-picker';

/**
 * A new investor, with the few fields worth capturing on a phone. Stages,
 * contacts, terms and documents are filled in on the desktop.
 */
export default function CreateInvestorScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Give it a name.');
      return;
    }

    setBusy(true);
    try {
      await api.createPipelineEntry('investor', {
        companyId,
        name: name.trim(),
        potentialAmount: amount ? Number(amount) : 0,
        notes: notes.trim() || undefined,
      });
      router.back();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.isOffline
            ? 'No connection. This one needs one.'
            : err.message
          : 'Could not save that.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: theme.spacing.lg }}>
        {error ? <ErrorNote message={error} /> : null}
        <CompanyPicker value={companyId} onChange={setCompanyId} permission="investor:write" />
        <Field label="Name" value={name} onChangeText={setName} autoFocus autoCapitalize="words" />
        <Field
          label="Potential amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0"
        />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
        <Button label="Save" onPress={submit} loading={busy} icon="save-outline" />
        <Body subtle size="sm">
          Stages, contacts and documents are added on the desktop.
        </Body>
      </View>
    </Screen>
  );
}
