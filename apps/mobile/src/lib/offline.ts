import type { QueuedMutation, SyncResultEntry } from '@eisman/shared';
import { readJson, writeJson } from './storage';
import { api } from './api';

/**
 * Changes made without a connection.
 *
 * A change is written to this queue first and sent when there is a network. It
 * carries an id generated here, which the server records, so a retry after a
 * lost response applies the change once rather than twice.
 *
 * Nothing is silently dropped: a change that the server refuses stays visible
 * as failed, with the reason, until the person deals with it.
 */

const QUEUE_KEY = 'eisman.offline.queue';
const FAILED_KEY = 'eisman.offline.failed';

export interface FailedMutation extends QueuedMutation {
  error: string;
  failedAt: string;
}

function uuid(): string {
  // RFC 4122 version 4, from Math.random. This id only has to be unique among
  // one person's queued changes, never unguessable.
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[(Math.floor(Math.random() * 16) & 0x3) | 0x8];
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

export async function readQueue(): Promise<QueuedMutation[]> {
  return (await readJson<QueuedMutation[]>(QUEUE_KEY)) ?? [];
}

export async function readFailed(): Promise<FailedMutation[]> {
  return (await readJson<FailedMutation[]>(FAILED_KEY)) ?? [];
}

export async function clearFailed(): Promise<void> {
  await writeJson(FAILED_KEY, []);
}

/** Adds a change to the queue and returns its id. */
export async function enqueue(
  kind: QueuedMutation['kind'],
  payload: unknown,
): Promise<QueuedMutation> {
  const mutation: QueuedMutation = {
    clientId: uuid(),
    kind,
    createdAt: new Date().toISOString(),
    payload,
  };
  const queue = await readQueue();
  await writeJson(QUEUE_KEY, [...queue, mutation]);
  return mutation;
}

export interface FlushResult {
  attempted: number;
  applied: number;
  failed: number;
  stillQueued: number;
  /** True when the queue could not be sent because there was no connection. */
  offline: boolean;
}

/**
 * Sends everything queued.
 *
 * Applied and duplicate both mean the server has it, so both leave the queue.
 * A refusal moves to the failed list with its reason. Anything the network
 * prevented stays queued for next time.
 */
export async function flushQueue(): Promise<FlushResult> {
  const queue = await readQueue();
  if (!queue.length) {
    return { attempted: 0, applied: 0, failed: 0, stillQueued: 0, offline: false };
  }

  let results: SyncResultEntry[];
  try {
    const response = await api.sync({ mutations: queue });
    results = response.results;
  } catch {
    return {
      attempted: queue.length,
      applied: 0,
      failed: 0,
      stillQueued: queue.length,
      offline: true,
    };
  }

  const byId = new Map(results.map((r) => [r.clientId, r]));
  const remaining: QueuedMutation[] = [];
  const failures: FailedMutation[] = [];
  let applied = 0;

  for (const mutation of queue) {
    const result = byId.get(mutation.clientId);
    if (!result) {
      remaining.push(mutation);
      continue;
    }
    if (result.status === 'applied' || result.status === 'duplicate') {
      applied += 1;
      continue;
    }
    failures.push({
      ...mutation,
      error: result.error ?? 'The server refused this change.',
      failedAt: new Date().toISOString(),
    });
  }

  await writeJson(QUEUE_KEY, remaining);
  if (failures.length) {
    await writeJson(FAILED_KEY, [...(await readFailed()), ...failures]);
  }

  return {
    attempted: queue.length,
    applied,
    failed: failures.length,
    stillQueued: remaining.length,
    offline: false,
  };
}
