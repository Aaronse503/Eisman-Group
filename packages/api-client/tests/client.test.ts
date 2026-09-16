import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiClientError } from '../src/index';

/**
 * The client both applications talk to the server through.
 *
 * What matters here is what it does at the edges: it sends the session token,
 * it can tell "no connection" from "not signed in", and it surfaces the
 * server's own words rather than a generic failure.
 */

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let fetchSpy: ReturnType<typeof vi.fn>;

function client(token: string | null = 'session-token', onUnauthenticated?: () => Promise<void>) {
  return new ApiClient({
    baseUrl: 'https://example.test',
    getToken: async () => token,
    onUnauthenticated,
    fetchImpl: fetchSpy as unknown as typeof fetch,
  });
}

beforeEach(() => {
  fetchSpy = vi.fn();
});

describe('sending a request', () => {
  it('carries the session token as a bearer token', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ items: [] }));
    await client().tasks();

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain('https://example.test/api/v1/tasks');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
  });

  it('sends no authorization header when there is no session', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ token: 'new' }));
    await client(null).signIn('someone@example.test', 'password');
    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe('when something goes wrong', () => {
  it('repeats the server’s own explanation rather than a generic failure', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ error: 'Give the task a title.', code: 'invalid_input', fields: { title: 'Required' } }, 400),
    );
    await expect(client().createTask({ title: '' })).rejects.toMatchObject({
      message: 'Give the task a title.',
      status: 400,
      fields: { title: 'Required' },
    });
  });

  it('tells a lost connection apart from a refusal', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await client()
      .tasks()
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).isOffline).toBe(true);
    expect((error as ApiClientError).isUnauthenticated).toBe(false);
  });

  it('reports an expired session and lets the app clear it once', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ error: 'Sign in to continue.', code: 'unauthenticated' }, 401));
    const cleared = vi.fn(async () => {});
    const error = await client('stale', cleared)
      .dashboard()
      .catch((err: unknown) => err);

    expect((error as ApiClientError).isUnauthenticated).toBe(true);
    expect(cleared).toHaveBeenCalledTimes(1);
  });
});
