import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';
import { installationId } from './storage';

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
