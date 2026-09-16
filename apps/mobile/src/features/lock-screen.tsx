import * as React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { biometricCapability } from '@/lib/biometrics';
import { Body, Button, Heading } from '@/components/ui';

/**
 * Shown when the app is open but locked.
 *
 * Nothing behind it is rendered, so a glance at an unattended phone shows no
 * client names and no figures.
 */
export function LockScreen() {
  const theme = useTheme();
  const { unlock, signOut, user } = useSession();
  const [label, setLabel] = React.useState('device unlock');
  const [refused, setRefused] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const capability = await biometricCapability();
      setLabel(capability.label);
      // Ask straight away; a person who opened the app wants to be in it.
      const ok = await unlock();
      if (!ok) setRefused(true);
    })();
  }, [unlock]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.xl, gap: theme.spacing.lg }}>
        <Ionicons name="lock-closed-outline" size={40} color={theme.colors.accent} />
        <Heading>Locked</Heading>
        <Body muted style={{ textAlign: 'center' }}>
          {user ? `Signed in as ${user.name}.` : ''} Unlock with {label} to continue.
        </Body>
        <View style={{ width: '100%', gap: theme.spacing.sm }}>
          <Button
            label={refused ? 'Try again' : `Unlock with ${label}`}
            icon="finger-print-outline"
            onPress={() => {
              setRefused(false);
              void unlock();
            }}
          />
          <Button label="Sign out instead" variant="ghost" onPress={() => void signOut()} />
        </View>
      </View>
    </SafeAreaView>
  );
}
