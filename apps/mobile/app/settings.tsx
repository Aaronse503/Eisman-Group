import * as React from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useTheme, useThemePreference, type ThemePreference } from '@/theme';
import {
  biometricCapability,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
} from '@/lib/biometrics';
import { registerForPush, unregisterPush } from '@/lib/notifications';
import { API_URL } from '@/lib/api';
import { Body, Button, Card, Row, Screen, SectionTitle } from '@/components/ui';

export default function SettingsScreen() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { user, signOut, companies } = useSession();

  const [biometricLabel, setBiometricLabel] = React.useState('device unlock');
  const [biometricAvailable, setBiometricAvailable] = React.useState(false);
  const [lockEnabled, setLockEnabled] = React.useState(false);
  const [pushEnabled, setPushEnabled] = React.useState(false);
  const [pushNote, setPushNote] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const capability = await biometricCapability();
      setBiometricAvailable(capability.available && capability.enrolled);
      setBiometricLabel(capability.label);
      setLockEnabled(await isBiometricLockEnabled());
    })();
  }, []);

  const togglePush = async (next: boolean) => {
    setBusy(true);
    setPushNote(null);
    try {
      if (next) {
        const result = await registerForPush();
        setPushEnabled(Boolean(result.token));
        if (!result.token) setPushNote(result.reason ?? 'Could not turn notifications on.');
      } else {
        await unregisterPush();
        setPushEnabled(false);
        setPushNote('This device will no longer receive notifications.');
      }
    } catch {
      setPushNote('Could not reach the server to change this.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <SectionTitle>Unlocking</SectionTitle>
      <Card>
        <Row justify="space-between">
          <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
            <Body style={{ fontWeight: '600' }}>
              {biometricAvailable ? `Require ${biometricLabel}` : 'Biometric unlock'}
            </Body>
            <Body subtle size="sm">
              {biometricAvailable
                ? 'Ask each time the app opens, so records stay private on an unattended phone.'
                : `This device has no ${biometricLabel} set up, so there is nothing to require.`}
            </Body>
          </View>
          <Switch
            value={lockEnabled}
            disabled={!biometricAvailable}
            onValueChange={(next) => {
              setLockEnabled(next);
              void setBiometricLockEnabled(next);
            }}
            accessibilityLabel={`Require ${biometricLabel} when opening the app`}
          />
        </Row>
      </Card>

      <SectionTitle>Notifications</SectionTitle>
      <Card>
        <Row justify="space-between">
          <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
            <Body style={{ fontWeight: '600' }}>Push notifications</Body>
            <Body subtle size="sm">
              Overdue work, follow-ups due, and things that change on records you own.
            </Body>
          </View>
          <Switch
            value={pushEnabled}
            disabled={busy}
            onValueChange={(next) => void togglePush(next)}
            accessibilityLabel="Push notifications"
          />
        </Row>
        {pushNote ? (
          <Body size="sm" muted style={{ marginTop: theme.spacing.sm }}>
            {pushNote}
          </Body>
        ) : null}
      </Card>

      <SectionTitle>Appearance</SectionTitle>
      <Card style={{ padding: 0 }}>
        {(['system', 'light', 'dark'] as ThemePreference[]).map((option, index) => (
          <Pressable
            key={option}
            onPress={() => setPreference(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected: preference === option }}
            accessibilityLabel={
              option === 'system' ? 'Match my device' : option === 'light' ? 'Light' : 'Dark'
            }
            style={({ pressed }) => ({
              minHeight: theme.minTouchTarget + 6,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: theme.spacing.lg,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: theme.colors.border,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Body>{option === 'system' ? 'Match my device' : option === 'light' ? 'Light' : 'Dark'}</Body>
            {preference === option ? (
              <Ionicons name="checkmark" size={18} color={theme.colors.accent} />
            ) : null}
          </Pressable>
        ))}
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card>
        <Body style={{ fontWeight: '600' }}>{user?.name}</Body>
        <Body subtle size="sm">
          {user?.email}
        </Body>
        <Body subtle size="sm" style={{ marginTop: theme.spacing.sm }}>
          {companies.length} {companies.length === 1 ? 'company' : 'companies'} · connected to{' '}
          {API_URL}
        </Body>
        <Body subtle size="sm" style={{ marginTop: theme.spacing.sm }}>
          Your password, your other sessions and your roles are managed in the web application.
        </Body>
      </Card>

      <Button
        label="Sign out"
        variant="danger"
        icon="log-out-outline"
        onPress={() => void signOut()}
        style={{ marginTop: theme.spacing.lg }}
      />
    </Screen>
  );
}
