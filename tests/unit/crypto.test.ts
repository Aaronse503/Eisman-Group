import { describe, expect, it } from 'vitest';
import {
  credentialHint,
  decryptSecret,
  encryptSecret,
  generateToken,
  hashPassword,
  hashToken,
  redact,
  verifyPassword,
} from '@/lib/crypto';

describe('password hashing', () => {
  it('never stores the password itself', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same-password', a)).toBe(true);
    expect(await verifyPassword('same-password', b)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('ChangeMe123!');
    expect(await verifyPassword('ChangeMe123', hash)).toBe(false);
    expect(await verifyPassword('changeme123!', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('rejects a missing or malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'bcrypt$aa$bb')).toBe(false);
  });

  it('normalises unicode so an equivalent password still verifies', async () => {
    // "é" composed vs. decomposed.
    const hash = await hashPassword('café-secret');
    expect(await verifyPassword('café-secret', hash)).toBe(true);
  });
});

describe('session tokens', () => {
  it('produces unique URL-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes deterministically so only the hash need be stored', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toHaveLength(64);
  });
});

describe('credential encryption', () => {
  it('round-trips a secret', () => {
    // Shaped like a provider credential without being one: a realistic-looking
    // key in a fixture trips secret scanners on the way to the repository.
    const secret = 'example-provider-credential-abcdef123456';
    const payload = encryptSecret(secret);
    expect(payload).not.toContain(secret);
    expect(payload.startsWith('v1.')).toBe(true);
    expect(decryptSecret(payload)).toBe(secret);
  });

  it('uses a fresh IV, so the same secret encrypts differently', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('refuses a tampered payload rather than returning wrong plaintext', () => {
    const payload = encryptSecret('sensitive');
    const [v, iv, tag, ct] = payload.split('.');
    const flipped = `${ct.slice(0, -2)}${ct.slice(-2) === 'AA' ? 'AB' : 'AA'}`;
    expect(() => decryptSecret(`${v}.${iv}.${tag}.${flipped}`)).toThrow();
  });

  it('refuses a malformed payload', () => {
    expect(() => decryptSecret('nonsense')).toThrow('Malformed encrypted payload.');
    expect(() => decryptSecret('v2.a.b.c')).toThrow('Malformed encrypted payload.');
  });

  it('handles empty strings and unicode', () => {
    expect(decryptSecret(encryptSecret(''))).toBe('');
    expect(decryptSecret(encryptSecret('key–with–dashes ☕'))).toBe('key–with–dashes ☕');
  });
});

describe('credentialHint', () => {
  it('shows only the ends of a long credential', () => {
    expect(credentialHint('example-credential-abcdefghijk')).toBe('exam••••hijk');
  });

  it('reveals nothing about a short one', () => {
    expect(credentialHint('short')).toBe('••••');
    expect(credentialHint('')).toBe('••••');
  });
});

describe('redact', () => {
  it('removes sensitive keys before anything is written to the audit log', () => {
    const out = redact({
      name: 'Kestrel Robotics',
      password: 'hunter2',
      apiKey: 'provider-key-x',
      api_key: 'provider-key-y',
      access_token: 'tok',
      ssn: '000-00-0000',
      routing: '123456789',
      account_number: '00012345',
      nested: { clientSecret: 'oops', label: 'fine' },
    });
    expect(out.password).toBe('[redacted]');
    expect(out.apiKey).toBe('[redacted]');
    expect(out.api_key).toBe('[redacted]');
    expect(out.access_token).toBe('[redacted]');
    expect(out.ssn).toBe('[redacted]');
    expect(out.routing).toBe('[redacted]');
    expect(out.account_number).toBe('[redacted]');
    expect(out.nested.clientSecret).toBe('[redacted]');
    expect(out.nested.label).toBe('fine');
    expect(out.name).toBe('Kestrel Robotics');
  });

  it('walks arrays', () => {
    const out = redact([{ token: 'a' }, { token: 'b' }]);
    expect(out).toEqual([{ token: '[redacted]' }, { token: '[redacted]' }]);
  });

  it('leaves primitives and null alone', () => {
    expect(redact(42)).toBe(42);
    expect(redact('plain')).toBe('plain');
    expect(redact(null)).toBe(null);
  });
});
