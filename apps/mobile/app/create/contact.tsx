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

export default function CreateContactScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { refreshQueueCount } = useSession();

  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [queued, setQueued] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    if (!firstName.trim()) {
      setError('A first name is required.');
      return;
    }
    if (!companyId) {
      setError('Choose a company.');
      return;
    }

    const payload = {
      companyId,
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      title: title.trim() || undefined,
    };

    setBusy(true);
    try {
      await api.createContact(payload);
      router.back();
    } catch (err) {
      if (err instanceof ApiClientError && err.isOffline) {
        await enqueue('contact.create', payload);
        await refreshQueueCount();
        setQueued(true);
      } else {
        setError(err instanceof ApiClientError ? err.message : 'Could not save that contact.');
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
            {firstName.trim()} {lastName.trim()} is waiting to send, and will appear in the CRM once
            you have a connection.
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
        <CompanyPicker value={companyId} onChange={setCompanyId} permission="crm:write" />
        <Field label="First name" value={firstName} onChangeText={setFirstName} autoFocus autoCapitalize="words" />
        <Field label="Last name" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Head of Marketing" />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="numeric" />
        <Button label="Save contact" onPress={submit} loading={busy} icon="person-add-outline" />
      </View>
    </Screen>
  );
}
