import { beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase } from '../db';
import { one, sql } from '@/lib/db/client';
import { recordAudit } from '@/lib/audit';
import { seedAll } from '@/lib/seed';
import type { Actor } from '@/lib/auth/actor';

/**
 * The audit log is the record of who changed what, and it has to be one that
 * nobody — including this application — can edit after the fact.
 */

let actor: Pick<Actor, 'user'>;

beforeAll(async () => {
  await freshDatabase();
  await seedAll({ demo: false });
  const owner = await one<Actor['user']>(
    `select id, email, name, title, avatar_url, timezone, status, is_demo, must_change_password
     from users where email = 'aaron@eismandigital.com'`,
  );
  actor = { user: owner! };
}, 300_000);

describe('append-only enforcement', () => {
  it('refuses an UPDATE at the database level', async () => {
    const id = await recordAudit({
      actor,
      action: 'test.update_attempt',
      entityType: 'test',
      entityLabel: 'Original label',
    });
    await expect(
      sql(`update audit_log set entity_label = 'Tampered' where id = $1`, [id]),
    ).rejects.toThrow(/append-only/i);

    const row = await one<{ entity_label: string }>(`select entity_label from audit_log where id = $1`, [id]);
    expect(row!.entity_label).toBe('Original label');
  });

  it('refuses a DELETE at the database level', async () => {
    const id = await recordAudit({ actor, action: 'test.delete_attempt', entityType: 'test' });
    await expect(sql(`delete from audit_log where id = $1`, [id])).rejects.toThrow(/append-only/i);
    expect(await sql(`select 1 from audit_log where id = $1`, [id])).toHaveLength(1);
  });

  it('refuses a bulk wipe', async () => {
    await recordAudit({ actor, action: 'test.bulk', entityType: 'test' });
    const before = (await sql<{ c: number }>(`select count(*)::int as c from audit_log`))[0]!.c;
    await expect(sql(`delete from audit_log`)).rejects.toThrow(/append-only/i);
    const after = (await sql<{ c: number }>(`select count(*)::int as c from audit_log`))[0]!.c;
    expect(after).toBe(before);
  });
});

describe('what a record captures', () => {
  it('keeps the operator, the reason and both sides of the change', async () => {
    const id = await recordAudit({
      actor,
      action: 'parfax.metric_override',
      entityType: 'parfax_metric',
      entityId: null,
      entityLabel: 'Forecast: paid subscribers',
      reason: 'Board pack correction agreed with finance',
      before: { value: 100 },
      after: { value: 120 },
      severity: 'notice',
      ip: '10.1.2.3',
      userAgent: 'Mozilla/5.0 (test)',
    });

    const row = await one<{
      actor_user_id: string; actor_email: string; reason: string; severity: string;
      before_value: unknown; after_value: unknown; actor_ip: string; created_at: Date;
    }>(`select actor_user_id, actor_email, reason, severity, before_value, after_value,
               actor_ip, created_at from audit_log where id = $1`, [id]);

    expect(row!.actor_user_id).toBe(actor.user.id);
    expect(row!.actor_email).toBe(actor.user.email);
    expect(row!.reason).toBe('Board pack correction agreed with finance');
    expect(row!.severity).toBe('notice');
    expect(row!.before_value).toEqual({ value: 100 });
    expect(row!.after_value).toEqual({ value: 120 });
    expect(row!.actor_ip).toBe('10.1.2.3');
    expect(row!.created_at).toBeInstanceOf(Date);
  });

  it('redacts secrets before they are written', async () => {
    const id = await recordAudit({
      actor,
      action: 'integration.connect',
      entityType: 'integration_connection',
      after: { provider: 'stripe', apiKey: 'provider-key-must-not-be-stored', mode: 'live' },
    });
    const row = await one<{ after_value: Record<string, unknown> }>(
      `select after_value from audit_log where id = $1`, [id],
    );
    expect(row!.after_value.apiKey).toBe('[redacted]');
    expect(row!.after_value.provider).toBe('stripe');
    const raw = await sql(`select 1 from audit_log where after_value::text like '%provider-key-must-not-be-stored%'`);
    expect(raw).toHaveLength(0);
  });

  it('records an action taken with no signed-in user, such as a scheduled job', async () => {
    const id = await recordAudit({ actor: null, action: 'system.sync', entityType: 'integration_run' });
    const row = await one<{ actor_user_id: string | null }>(
      `select actor_user_id from audit_log where id = $1`, [id],
    );
    expect(row!.actor_user_id).toBe(null);
  });

  it('truncates an overlong user agent rather than failing the write', async () => {
    const id = await recordAudit({
      actor,
      action: 'test.long_ua',
      entityType: 'test',
      userAgent: 'x'.repeat(5000),
    });
    const row = await one<{ user_agent: string }>(`select user_agent from audit_log where id = $1`, [id]);
    expect(row!.user_agent.length).toBeLessThanOrEqual(500);
  });
});
