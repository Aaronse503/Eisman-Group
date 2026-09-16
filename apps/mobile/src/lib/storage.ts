import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Two stores, deliberately.
 *
 * The session token goes to the device keychain (iOS) or keystore-backed
 * encrypted preferences (Android), where another app cannot read it and it
 * survives an upgrade but not a restore to a different device.
 *
 * Cached records and preferences go to ordinary storage: losing them costs a
 * refresh, and keeping business data out of the keychain keeps it small and
 * fast, which is what it is for.
 */

const TOKEN_KEY = 'eisman.session.token';
const INSTALLATION_KEY = 'eisman.installation.id';

/**
 * There is no keychain in a browser.
 *
 * `expo start --web` is a development convenience — the product is the iOS and
 * Android build — so on web the token falls back to ordinary storage rather
 * than the app failing to start. On a device this never runs: the keychain is
 * always used, which is the whole point of storing the token there.
 */
const HAS_KEYCHAIN = Platform.OS !== 'web';

async function secureSet(key: string, value: string): Promise<void> {
  if (!HAS_KEYCHAIN) {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function secureGet(key: string): Promise<string | null> {
  if (!HAS_KEYCHAIN) return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function secureDelete(key: string): Promise<void> {
  if (!HAS_KEYCHAIN) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveToken(token: string): Promise<void> {
  await secureSet(TOKEN_KEY, token);
}

export async function readToken(): Promise<string | null> {
  try {
    return await secureGet(TOKEN_KEY);
  } catch {
    // A corrupt keychain entry should sign the person in again, not crash.
    return null;
  }
}

export async function clearToken(): Promise<void> {
  await secureDelete(TOKEN_KEY).catch(() => undefined);
}

/**
 * A stable id for this installation, so the server can tell one of a person's
 * devices from another. Reinstalling produces a new one, which is correct: it
 * is a different installation with different notification permission.
 */
export async function installationId(): Promise<string> {
  const existing = await secureGet(INSTALLATION_KEY).catch(() => null);
  if (existing) return existing;
  const generated = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
  await secureSet(INSTALLATION_KEY, generated).catch(() => undefined);
  return generated;
}

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the cache is an optimisation, not a
    // requirement, so failing to write it must not break anything.
  }
}

export async function removeKey(key: string): Promise<void> {
  await AsyncStorage.removeItem(key).catch(() => undefined);
}
