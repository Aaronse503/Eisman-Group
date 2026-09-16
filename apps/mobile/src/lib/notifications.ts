import * as React from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from './api';
import { installationId } from './storage';
import { routeForNotification, type NotificationPayload } from './deep-links';

/**
 * Push notifications.
 *
 * Registration only happens after the person allows it, and the token is sent
 * to the server so a notification can reach this device. Turning it off clears
 * the token, which stops delivery at the source rather than relying on the
 * device to ignore what arrives.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export interface PushRegistration {
  granted: boolean;
  token: string | null;
  /** Why it did not register, in words worth showing someone. */
  reason?: string;
}

export async function registerForPush(): Promise<PushRegistration> {
  if (!Device.isDevice) {
    return {
      granted: false,
      token: null,
      reason: 'Push notifications need a real device; a simulator cannot receive them.',
    };
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') {
    return {
      granted: false,
      token: null,
      reason: 'Notifications are turned off for this app in your device settings.',
    };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Command Center',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#0f5132',
    });
  }

  const projectId =
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ||
    Constants.easConfig?.projectId;
  if (!projectId) {
    return {
      granted: true,
      token: null,
      reason:
        'This build has no EAS project id, so a push token cannot be issued. Run `eas init` and rebuild.',
    };
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.registerPushToken(
    await installationId(),
    Platform.OS === 'ios' ? 'ios' : 'android',
    token,
  );
  return { granted: true, token };
}

/** Stops delivery for this device. */
export async function unregisterPush(): Promise<void> {
  await api.registerPushToken(
    await installationId(),
    Platform.OS === 'ios' ? 'ios' : 'android',
    null,
  );
}

/**
 * Opens the record a notification is about when someone taps it.
 *
 * Handles both a tap while the app is running and a tap that started it: the
 * last response is read once on mount, so a notification opened from a cold
 * start lands on the same screen.
 */
export function useNotificationRouting(enabled: boolean) {
  const router = useRouter();
  const handled = React.useRef<string | null>(null);

  const open = React.useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      const route = routeForNotification(
        response.notification.request.content.data as NotificationPayload | undefined,
      );
      if (route) router.push(route as never);
    },
    [router],
  );

  React.useEffect(() => {
    // There are no push notifications in a browser; `expo start --web` is a
    // development convenience, and asking for them there throws.
    if (!enabled || Platform.OS === 'web') return;
    let cancelled = false;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!cancelled) open(response);
      })
      .catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [enabled, open]);
}
