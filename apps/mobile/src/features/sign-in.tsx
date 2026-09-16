import * as React from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiClientError } from '@eisman/api-client';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { API_URL } from '@/lib/api';
import { Body, Button, ErrorNote, Field, Heading } from '@/components/ui';

export function SignIn() {
  const theme = useTheme();
  const { signIn } = useSession();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(
          err.isOffline
            ? 'No connection. Signing in for the first time needs one.'
            : err.message,
        );
      } else {
        setError('Could not sign in. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.lg }}
      >
        <View style={{ gap: 6 }}>
          <Heading>Command Center</Heading>
          <Body muted>Eisman Holdings</Body>
        </View>

        {error ? <ErrorNote message={error} /> : null}

        <View style={{ gap: theme.spacing.md }}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@eismandigital.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <Button label="Sign in" onPress={submit} loading={busy} icon="log-in-outline" />
        </View>

        <Body subtle size="sm">
          Connecting to {API_URL}. Internal system — authorized personnel only, and every sign-in is
          recorded.
        </Body>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
