import * as React from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, type ThemePreference, useTheme } from '@/theme';
import { SessionProvider, useSession } from '@/lib/session';
import { readJson, writeJson } from '@/lib/storage';
import { Loading } from '@/components/ui';

const THEME_KEY = 'eisman.theme.preference';

/**
 * Where a person is allowed to be, given the state of their session.
 *
 * The navigator stays mounted and the guard redirects, rather than swapping
 * the navigator out: replacing the tree underneath the router leaves it
 * holding navigation state for screens that no longer exist.
 */
function useAuthGuard() {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (status === 'loading') return;
    const first = segments[0] as string | undefined;
    const onSignIn = first === 'sign-in';
    const onLock = first === 'lock';

    if (status === 'signedOut' && !onSignIn) router.replace('/sign-in');
    else if (status === 'locked' && !onLock) router.replace('/lock');
    else if (status === 'signedIn' && (onSignIn || onLock)) router.replace('/');
  }, [status, segments, router]);

  return status;
}

function Shell() {
  const theme = useTheme();
  const status = useAuthGuard();

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.bg }}>
        <Loading label="Opening the Command Center" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.fg,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="lock" options={{ headerShown: false }} />
        <Stack.Screen name="client/[id]" options={{ title: 'Client' }} />
        <Stack.Screen name="contact/[id]" options={{ title: 'Contact' }} />
        <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
        <Stack.Screen name="create/task" options={{ title: 'New task', presentation: 'modal' }} />
        <Stack.Screen name="create/note" options={{ title: 'New note', presentation: 'modal' }} />
        <Stack.Screen name="create/contact" options={{ title: 'New contact', presentation: 'modal' }} />
        <Stack.Screen name="create/meeting" options={{ title: 'New meeting', presentation: 'modal' }} />
        <Stack.Screen name="create/investor" options={{ title: 'New investor', presentation: 'modal' }} />
        <Stack.Screen name="create/partnership" options={{ title: 'New partnership', presentation: 'modal' }} />
        <Stack.Screen name="create/document" options={{ title: 'Add a document', presentation: 'modal' }} />
        <Stack.Screen name="search" options={{ title: 'Search', presentation: 'modal' }} />
        <Stack.Screen name="scope" options={{ title: 'Workspace', presentation: 'modal' }} />
        <Stack.Screen name="parfax/metrics" options={{ title: 'ParFax metrics' }} />
        <Stack.Screen name="parfax/users" options={{ title: 'ParFax users' }} />
        <Stack.Screen name="pipeline/[kind]" options={{ title: 'Pipeline' }} />
        <Stack.Screen name="sync" options={{ title: 'Sync' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [preference, setPreferenceState] = React.useState<ThemePreference>('system');

  React.useEffect(() => {
    void (async () => {
      const stored = await readJson<ThemePreference>(THEME_KEY);
      if (stored) setPreferenceState(stored);
    })();
  }, []);

  const setPreference = React.useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void writeJson(THEME_KEY, next);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider preference={preference} setPreference={setPreference}>
          <SessionProvider>
            <Shell />
          </SessionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
