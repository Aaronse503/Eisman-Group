import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncRequest, SyncResponse, SyncResultEntry } from '@eisman/shared';

/**
 * The offline queue is the part of the app a person has to be able to trust
 * without looking: a note written on a plane must arrive, exactly once, and a
 * change the server refuses must stay visible rather than vanish.
 */

const store = new Map<string, unknown>();

vi.mock('@/lib/storage', () => ({
  readJson: async (key: string) => store.get(key) ?? null,
  writeJson: async (key: string, value: unknown) => {
    store.set(key, value);
  },
}));

const sync = vi.fn<(request: SyncRequest) => Promise<SyncResponse>>();
vi.mock('@/lib/api', () => ({ api: { sync: (request: SyncRequest) => sync(request) } }));

const answer = (...results: SyncResultEntry[]): SyncResponse => ({
  results,
  serverTime: new Date().toISOString(),
});

const { clearFailed, enqueue, flushQueue, readFailed, readQueue } = await import('@/lib/offline');

beforeEach(async () => {
  store.clear();
  sync.mockReset();
});

describe('queueing a change', () => {
  it('keeps it, in order, with an id of its own', async () => {
    const first = await enqueue('note.create', { body: 'Spoke to Harbour Capital' });
    const second = await enqueue('task.create', { title: 'Send the deck' });

    const queue = await readQueue();
    expect(queue.map((m) => m.clientId)).toEqual([first.clientId, second.clientId]);
    expect(first.clientId).not.toBe(second.clientId);
    expect(first.clientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('sending the queue', () => {
  it('does nothing when there is nothing queued', async () => {
    expect(await flushQueue()).toMatchObject({ attempted: 0, applied: 0, offline: false });
    expect(sync).not.toHaveBeenCalled();
  });

  it('clears what the server has, whether it applied it now or already had it', async () => {
    const a = await enqueue('note.create', { body: 'One' });
    const b = await enqueue('note.create', { body: 'Two' });
    sync.mockResolvedValue(
      answer(
        { clientId: a.clientId, status: 'applied', id: 'n1' },
        { clientId: b.clientId, status: 'duplicate', id: 'n2' },
      ),
    );

    expect(await flushQueue()).toMatchObject({
      attempted: 2,
      applied: 2,
      failed: 0,
      stillQueued: 0,
      offline: false,
    });
    expect(await readQueue()).toHaveLength(0);
    expect(await readFailed()).toHaveLength(0);
  });

  it('keeps everything queued when there is no connection', async () => {
    await enqueue('task.create', { title: 'Written on a plane' });
    sync.mockRejectedValue(new Error('No connection.'));

    expect(await flushQueue()).toMatchObject({
      attempted: 1,
      applied: 0,
      stillQueued: 1,
      offline: true,
    });
    expect(await readQueue()).toHaveLength(1);
  });

  it('moves a refusal to the failed list with the reason, and keeps it there', async () => {
    const a = await enqueue('task.create', { title: '' });
    sync.mockResolvedValue(answer({ clientId: a.clientId, status: 'failed', error: 'Give the task a title.' }));

    expect(await flushQueue()).toMatchObject({ applied: 0, failed: 1, stillQueued: 0 });
    expect(await readQueue()).toHaveLength(0);
    const failed = await readFailed();
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ clientId: a.clientId, error: 'Give the task a title.' });

    await clearFailed();
    expect(await readFailed()).toHaveLength(0);
  });

  it('leaves a change the server did not answer for queued, rather than assuming', async () => {
    const a = await enqueue('note.create', { body: 'Answered' });
    const b = await enqueue('note.create', { body: 'Not answered' });
    sync.mockResolvedValue(answer({ clientId: a.clientId, status: 'applied', id: 'n1' }));

    expect(await flushQueue()).toMatchObject({ attempted: 2, applied: 1, stillQueued: 1 });
    expect((await readQueue()).map((m) => m.clientId)).toEqual([b.clientId]);
  });

  it('sends the same id again after a lost answer, so the server can spot the retry', async () => {
    const a = await enqueue('note.create', { body: 'Sent into a tunnel' });
    sync.mockRejectedValueOnce(new Error('No connection.'));
    await flushQueue();

    sync.mockResolvedValue(answer({ clientId: a.clientId, status: 'duplicate', id: 'n1' }));
    await flushQueue();

    expect(sync.mock.calls[1]![0].mutations).toMatchObject([{ clientId: a.clientId }]);
    expect(await readQueue()).toHaveLength(0);
  });
});
