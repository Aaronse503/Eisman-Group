import { createHash, randomUUID } from 'node:crypto';
import { getEnv } from '@/lib/env';

export interface StoredFile {
  key: string;
  size: number;
  checksum: string;
  driver: 'local' | 'supabase';
}

export interface StorageDriver {
  readonly name: 'local' | 'supabase';
  put(key: string, data: Buffer, contentType: string): Promise<StoredFile>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Namespaced key: company/yyyy/mm/uuid-filename. Keys are never user-supplied. */
export function buildKey(companyId: string, filename: string) {
  const now = new Date();
  const safe = filename
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-120);
  return `${companyId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}-${safe}`;
}

function localDriver(): StorageDriver {
  const root = getEnv().LOCAL_STORAGE_DIR;
  return {
    name: 'local',
    async put(key, data) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { dirname, join, resolve } = await import('node:path');
      const target = resolve(join(root, key));
      // Defence in depth: a key must never escape the storage root.
      if (!target.startsWith(resolve(root))) throw new Error('Invalid storage key.');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
      return {
        key,
        size: data.byteLength,
        checksum: createHash('sha256').update(data).digest('hex'),
        driver: 'local',
      };
    },
    async get(key) {
      const { readFile } = await import('node:fs/promises');
      const { join, resolve } = await import('node:path');
      const target = resolve(join(root, key));
      if (!target.startsWith(resolve(root))) throw new Error('Invalid storage key.');
      return readFile(target);
    },
    async delete(key) {
      const { rm } = await import('node:fs/promises');
      const { join, resolve } = await import('node:path');
      const target = resolve(join(root, key));
      if (!target.startsWith(resolve(root))) throw new Error('Invalid storage key.');
      await rm(target, { force: true });
    },
  };
}

/**
 * Supabase Storage driver. Files are written to a private bucket; the app
 * always serves them through its own authorized route rather than handing out
 * the object URL, so access is checked on every read.
 */
function supabaseDriver(): StorageDriver {
  const env = getEnv();
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  if (!url || !key) {
    throw new Error('STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const base = `${url.replace(/\/+$/, '')}/storage/v1/object`;
  const headers = { Authorization: `Bearer ${key}`, apikey: key };

  return {
    name: 'supabase',
    async put(objectKey, data, contentType) {
      const res = await fetch(`${base}/${bucket}/${encodeURI(objectKey)}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': contentType, 'x-upsert': 'true' },
        body: new Uint8Array(data),
      });
      if (!res.ok) {
        throw new Error(`Supabase Storage upload failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      }
      return {
        key: objectKey,
        size: data.byteLength,
        checksum: createHash('sha256').update(data).digest('hex'),
        driver: 'supabase',
      };
    },
    async get(objectKey) {
      const res = await fetch(`${base}/${bucket}/${encodeURI(objectKey)}`, { headers });
      if (!res.ok) throw new Error(`Supabase Storage read failed (${res.status}).`);
      return Buffer.from(await res.arrayBuffer());
    },
    async delete(objectKey) {
      await fetch(`${base}/${bucket}/${encodeURI(objectKey)}`, { method: 'DELETE', headers });
    },
  };
}

let cached: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (!cached) {
    cached = getEnv().STORAGE_DRIVER === 'supabase' ? supabaseDriver() : localDriver();
  }
  return cached;
}

export function resetStorageForTests() {
  cached = null;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Allow-list of types we can store and (where applicable) extract text from.
 * Anything else is rejected rather than stored with an unknown type.
 */
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export function isAllowedMime(mime: string) {
  return ALLOWED_MIME_TYPES.has(mime);
}
