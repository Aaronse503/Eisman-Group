import * as React from 'react';
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import type { ApiCompany, ApiUser, Permission, RoleGrant } from '@eisman/shared';
import { hasPermission } from '@eisman/shared';
import { ApiClientError } from '@eisman/api-client';
import { api, setUnauthenticatedHandler } from './api';
import { clearToken, installationId, readToken, readJson, saveToken, writeJson } from './storage';
import { authenticate, isBiometricLockEnabled } from './biometrics';
import { flushQueue, readQueue, type FlushResult } from './offline';

/**
 * Who is signed in, what they may do, and whether the device is locked.
 *
 * The permission list is here so the interface can hide what a person cannot
 * use. It is a courtesy, not a control: the server checks every request
 * regardless of what this device believes.
 */

const SESSION_KEY = 'eisman.session.profile';
const SCOPE_KEY = 'eisman.session.scope';

interface StoredProfile {
  user: ApiUser;
  companies: ApiCompany[];
  grants: RoleGrant[];
  permissions: Permission[];
  demoMode: boolean;
}

export interface SessionState {
  status: 'loading' | 'signedOut' | 'locked' | 'signedIn';
  user: ApiUser | null;
  companies: ApiCompany[];
  permissions: Permission[];
  grants: RoleGrant[];
  demoMode: boolean;
  /** The active workspace: a company slug, or 'holdings' for everything. */
  scope: string;
  mustChangePassword: boolean;
  queuedChanges: number;
  lastSync: Date | null;
  syncing: boolean;
}

interface SessionActions {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  unlock: () => Promise<boolean>;
  setScope: (scope: string) => void;
  can: (permission: Permission, companyId?: string | null) => boolean;
  refresh: () => Promise<void>;
  sync: () => Promise<FlushResult>;
  refreshQueueCount: () => Promise<void>;
}

const SessionContext = React.createContext<(SessionState & SessionActions) | null>(null);

async function deviceInfo() {
  return {
    installationId: await installationId(),
    platform: (Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web') as
      | 'ios'
      | 'android'
      | 'web',
    model: Device.modelName ?? undefined,
    osVersion: Device.osVersion ?? undefined,
    appVersion: Application.nativeApplicationVersion ?? undefined,
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<SessionState>({
    status: 'loading',
    user: null,
    companies: [],
    permissions: [],
    grants: [],
    demoMode: false,
    scope: 'holdings',
    mustChangePassword: false,
    queuedChanges: 0,
    lastSync: null,
    syncing: false,
  });

  const apply = React.useCallback((profile: StoredProfile, status: SessionState['status']) => {
    setState((prev) => ({
      ...prev,
      status,
      user: profile.user,
      companies: profile.companies,
      permissions: profile.permissions,
      grants: profile.grants,
      demoMode: profile.demoMode,
      mustChangePassword: profile.user.mustChangePassword,
    }));
  }, []);

  const refreshQueueCount = React.useCallback(async () => {
    const queue = await readQueue();
    setState((prev) => ({ ...prev, queuedChanges: queue.length }));
  }, []);

  const signOut = React.useCallback(async () => {
    try {
      await api.signOut(await installationId());
    } catch {
      // Signing out locally matters more than telling the server; the session
      // expires on its own, and the person wanted out now.
    }
    await clearToken();
    await writeJson(SESSION_KEY, null);
    setState((prev) => ({
      ...prev,
      status: 'signedOut',
      user: null,
      companies: [],
      permissions: [],
      grants: [],
      mustChangePassword: false,
    }));
  }, []);

  // Restore a session on launch.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setUnauthenticatedHandler(() => {
        setState((prev) => ({ ...prev, status: 'signedOut', user: null }));
      });

      const [token, storedScope, stored] = await Promise.all([
        readToken(),
        readJson<string>(SCOPE_KEY),
        readJson<StoredProfile>(SESSION_KEY),
      ]);
      if (cancelled) return;
      if (storedScope) setState((prev) => ({ ...prev, scope: storedScope }));

      if (!token) {
        setState((prev) => ({ ...prev, status: 'signedOut' }));
        return;
      }

      // Show what was last known immediately, then confirm with the server.
      // A phone opening in a lift should not be a blank screen.
      const locked = await isBiometricLockEnabled();
      if (stored) apply(stored, locked ? 'locked' : 'signedIn');

      try {
        const session = await api.session();
        if (cancelled) return;
        const profile: StoredProfile = {
          user: session.user,
          companies: session.companies,
          grants: session.grants,
          permissions: session.permissions,
          demoMode: session.demoMode,
        };
        await writeJson(SESSION_KEY, profile);
        apply(profile, locked && !stored ? 'locked' : locked ? 'locked' : 'signedIn');
      } catch (err) {
        if (err instanceof ApiClientError && err.isUnauthenticated) {
          await clearToken();
          setState((prev) => ({ ...prev, status: 'signedOut' }));
          return;
        }
        // Offline with a stored profile: carry on with what is known.
        if (!stored) setState((prev) => ({ ...prev, status: 'signedOut' }));
      }
      await refreshQueueCount();
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, refreshQueueCount]);

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      const session = await api.signIn(email, password, await deviceInfo());
      await saveToken(session.token);
      const profile: StoredProfile = {
        user: session.user,
        companies: session.companies,
        grants: session.grants,
        permissions: session.permissions,
        demoMode: session.demoMode,
      };
      await writeJson(SESSION_KEY, profile);
      apply(profile, 'signedIn');
      await refreshQueueCount();
    },
    [apply, refreshQueueCount],
  );

  const unlock = React.useCallback(async () => {
    const ok = await authenticate('Unlock the Command Center');
    if (ok) setState((prev) => ({ ...prev, status: 'signedIn' }));
    return ok;
  }, []);

  const refresh = React.useCallback(async () => {
    try {
      const session = await api.session();
      const profile: StoredProfile = {
        user: session.user,
        companies: session.companies,
        grants: session.grants,
        permissions: session.permissions,
        demoMode: session.demoMode,
      };
      await writeJson(SESSION_KEY, profile);
      apply(profile, 'signedIn');
    } catch {
      // Leave what is on screen; the next attempt may succeed.
    }
  }, [apply]);

  const sync = React.useCallback(async () => {
    setState((prev) => ({ ...prev, syncing: true }));
    const result = await flushQueue();
    setState((prev) => ({
      ...prev,
      syncing: false,
      queuedChanges: result.stillQueued,
      lastSync: result.offline ? prev.lastSync : new Date(),
    }));
    return result;
  }, []);

  const setScope = React.useCallback((scope: string) => {
    setState((prev) => ({ ...prev, scope }));
    void writeJson(SCOPE_KEY, scope);
  }, []);

  const can = React.useCallback(
    (permission: Permission, companyId: string | null = null) =>
      hasPermission(state.grants, permission, companyId),
    [state.grants],
  );

  // Send anything queued when the app comes back to the foreground.
  React.useEffect(() => {
    if (state.status !== 'signedIn') return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void sync();
    });
    void sync();
    return () => subscription.remove();
  }, [state.status, sync]);

  const value = React.useMemo(
    () => ({ ...state, signIn, signOut, unlock, setScope, can, refresh, sync, refreshQueueCount }),
    [state, signIn, signOut, unlock, setScope, can, refresh, sync, refreshQueueCount],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = React.useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a SessionProvider');
  return context;
}

/** The company id for the active workspace, or null for the holdings view. */
export function useScopeCompanyId(): string | null {
  const { scope, companies } = useSession();
  if (scope === 'holdings') return null;
  return companies.find((c) => c.slug === scope)?.id ?? null;
}
