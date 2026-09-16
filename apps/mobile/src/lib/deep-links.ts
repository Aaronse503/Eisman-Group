/**
 * Where a notification, or a link from outside the app, should land.
 *
 * Notifications are written once, by the server, for both applications — so
 * they carry the web path (`/tasks/<id>`) and the record it points at
 * (`task`, `<id>`). The mobile route names differ, so the translation happens
 * here rather than being duplicated at every call site.
 *
 * Anything with no mobile screen returns null, and the caller leaves the
 * person where they are instead of opening a blank page.
 */

const BY_ENTITY: Record<string, (id: string) => string> = {
  task: (id) => `/task/${id}`,
  client: (id) => `/client/${id}`,
  contact: (id) => `/contact/${id}`,
  investor: () => '/pipeline/investor',
  partnership: () => '/pipeline/partnership',
  meeting: () => '/(tabs)/calendar',
};

/** Web paths that have a mobile equivalent, longest prefix first. */
const BY_PATH: [RegExp, (id: string) => string][] = [
  [/^\/tasks\/([0-9a-f-]{36})$/i, (id) => `/task/${id}`],
  [/^\/crm\/clients\/([0-9a-f-]{36})$/i, (id) => `/client/${id}`],
  [/^\/crm\/contacts\/([0-9a-f-]{36})$/i, (id) => `/contact/${id}`],
  [/^\/investors\/[0-9a-f-]{36}$/i, () => '/pipeline/investor'],
  [/^\/partnerships\/[0-9a-f-]{36}$/i, () => '/pipeline/partnership'],
];

const STATIC_PATHS: Record<string, string> = {
  '/': '/(tabs)',
  '/tasks': '/(tabs)/tasks',
  '/crm': '/(tabs)/crm',
  '/calendar': '/(tabs)/calendar',
  '/investors': '/pipeline/investor',
  '/partnerships': '/pipeline/partnership',
  '/parfax': '/parfax/metrics',
  '/parfax/users': '/parfax/users',
};

export function routeForEntity(entityType?: string | null, entityId?: string | null): string | null {
  if (!entityType) return null;
  const build = BY_ENTITY[entityType];
  if (!build) return null;
  if (!entityId && entityType !== 'investor' && entityType !== 'partnership' && entityType !== 'meeting') {
    return null;
  }
  return build(entityId ?? '');
}

export function routeForHref(href?: string | null): string | null {
  if (!href) return null;
  let path = href;
  // Accept a full URL as well as a path, so a link from an email works too.
  if (/^https?:\/\//i.test(href)) {
    try {
      path = new URL(href).pathname;
    } catch {
      return null;
    }
  }
  if (!path.startsWith('/')) return null;
  path = path.replace(/\/+$/, '') || '/';

  if (STATIC_PATHS[path]) return STATIC_PATHS[path];
  for (const [pattern, build] of BY_PATH) {
    const match = pattern.exec(path);
    if (match) return build(match[1] ?? '');
  }
  return null;
}

export interface NotificationPayload {
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/** The screen a tapped notification should open, if any. */
export function routeForNotification(data: NotificationPayload | undefined | null): string | null {
  if (!data) return null;
  return routeForEntity(data.entityType, data.entityId) ?? routeForHref(data.href);
}
