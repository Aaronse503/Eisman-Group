import * as LocalAuthentication from 'expo-local-authentication';
import { readJson, writeJson } from './storage';

/**
 * Face ID, Touch ID or the device's own lock, used to re-open a session that
 * is already signed in.
 *
 * It protects the app on an unlocked phone; it is not a second factor and is
 * not treated as one. The session token is what authenticates to the server,
 * and it lives in the keychain either way.
 */

const ENABLED_KEY = 'eisman.biometrics.enabled';

export interface BiometricCapability {
  available: boolean;
  enrolled: boolean;
  /** What to call it on this device, so the prompt matches the hardware. */
  label: string;
}

export async function biometricCapability(): Promise<BiometricCapability> {
  const [available, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  let label = 'device unlock';
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) label = 'Face ID';
  else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) label = 'fingerprint';
  else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) label = 'iris';

  return { available, enrolled, label };
}

export async function isBiometricLockEnabled(): Promise<boolean> {
  return (await readJson<boolean>(ENABLED_KEY)) ?? false;
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  await writeJson(ENABLED_KEY, enabled);
}

/**
 * Asks for the device's biometric check.
 *
 * Falls back to the passcode, because a failed fingerprint should not lock
 * someone out of their own business records. Returns false when the person
 * cancels, which leaves the app locked rather than signing them out.
 */
export async function authenticate(reason: string): Promise<boolean> {
  const capability = await biometricCapability();
  if (!capability.available || !capability.enrolled) return true;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use passcode',
    disableDeviceFallback: false,
  });
  return result.success;
}
