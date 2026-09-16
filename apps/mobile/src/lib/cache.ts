import { readJson, writeJson } from './storage';

/**
 * Records kept on the device so a recently viewed screen still opens with no
 * connection.
 *
 * Deliberately simple: the last response for a key, with the time it was
 * fetched, so the interface can say how old it is rather than presenting stale
 * figures as current.
 */

interface Cached<T> {
  data: T;
  at: string;
}

export async function cacheWrite<T>(key: string, data: T): Promise<void> {
  await writeJson(`eisman.cache.${key}`, { data, at: new Date().toISOString() } satisfies Cached<T>);
}

export async function cacheRead<T>(key: string): Promise<{ data: T; at: Date } | null> {
  const entry = await readJson<Cached<T>>(`eisman.cache.${key}`);
  if (!entry) return null;
  return { data: entry.data, at: new Date(entry.at) };
}

/**
 * Fetches, falling back to what was last seen.
 *
 * The caller is told which it got, so a screen showing cached figures can say
 * so instead of implying they are live.
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<{ data: T; stale: boolean; at: Date | null }> {
  try {
    const data = await fetcher();
    await cacheWrite(key, data);
    return { data, stale: false, at: new Date() };
  } catch (err) {
    const cached = await cacheRead<T>(key);
    if (cached) return { data: cached.data, stale: true, at: cached.at };
    throw err;
  }
}
