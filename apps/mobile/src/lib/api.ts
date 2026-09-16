import Constants from 'expo-constants';
import { ApiClient } from '@eisman/api-client';
import { readToken, clearToken } from './storage';

/**
 * The single API client for the application.
 *
 * The base URL comes from the build's configuration, so a development build
 * points at a laptop and a production build at the real server without any
 * code difference.
 */
export const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://localhost:3000';

let onUnauthenticated: (() => void) | null = null;

/** Lets the session layer react when the server says the token is no good. */
export function setUnauthenticatedHandler(handler: (() => void) | null) {
  onUnauthenticated = handler;
}

export const api = new ApiClient({
  baseUrl: API_URL,
  getToken: () => readToken(),
  onUnauthenticated: async () => {
    await clearToken();
    onUnauthenticated?.();
  },
  timeoutMs: 20_000,
});
