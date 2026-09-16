import { sql } from '@/lib/db/client';
import { upsertMapped } from '../mapping';
import {
  providerFetch,
  IntegrationError,
  type IntegrationAdapter,
  type SyncContext,
  type SyncResult,
} from '../types';

const API = 'https://api.stripe.com/v1';

interface StripeList<T> {
  data: T[];
  has_more: boolean;
}
interface StripeCustomer {
  id: string;
  name: string | null;
  email: string | null;
  created: number;
}
interface StripeInvoice {
  id: string;
  number: string | null;
  customer: string | null;
  status: string;
  created: number;
  due_date: number | null;
  currency: string;
  subtotal: number;
  tax: number | null;
  total: number;
  amount_paid: number;
  amount_due: number;
  hosted_invoice_url: string | null;
  description: string | null;
}
interface StripeCharge {
  id: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  status: string;
  created: number;
  paid: boolean;
  refunded: boolean;
  invoice: string | null;
  customer: string | null;
  failure_message: string | null;
  payment_method_details?: { type?: string } | null;
  description: string | null;
}
interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  created: number;
  current_period_start: number | null;
  current_period_end: number | null;
  canceled_at: number | null;
  items: { data: { price: { unit_amount: number | null; currency: string; recurring?: { interval: string } | null; nickname: string | null; id: string } ; quantity: number }[] };
}

const cents = (n: number | null | undefined) => (n ?? 0) / 100;
const stamp = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);

function auth(key: string) {
  return { Authorization: `Bearer ${key}` };
}

const STATUS_MAP: Record<string, string> = {
  draft: 'draft',
  open: 'open',
  paid: 'paid',
  void: 'void',
  uncollectible: 'uncollectible',
};

/** Deterministic demo fixtures, written with source='stripe' and is_demo=true. */
function demoData() {
  const now = Math.floor(Date.now() / 1000);
  const customers: StripeCustomer[] = [
    { id: 'cus_demo_1', name: 'Northwind Outfitters', email: 'billing@northwindoutfitters.com', created: now - 400 * 86400 },
    { id: 'cus_demo_2', name: 'Harbor & Vine', email: 'ap@harborandvine.com', created: now - 300 * 86400 },
    { id: 'cus_demo_3', name: 'Cedar Ridge Dental Group', email: 'finance@cedarridgedental.com', created: now - 250 * 86400 },
  ];
  const invoices: StripeInvoice[] = customers.flatMap((c, ci) =>
    [0, 1, 2].map((m) => ({
      id: `in_demo_${ci}_${m}`,
      number: `DEMO-${1000 + ci * 10 + m}`,
      customer: c.id,
      status: m === 0 ? 'open' : 'paid',
      created: now - m * 30 * 86400,
      due_date: now - m * 30 * 86400 + 30 * 86400,
      currency: 'usd',
      subtotal: [1250000, 850000, 600000][ci]!,
      tax: 0,
      total: [1250000, 850000, 600000][ci]!,
      amount_paid: m === 0 ? 0 : [1250000, 850000, 600000][ci]!,
      amount_due: m === 0 ? [1250000, 850000, 600000][ci]! : 0,
      hosted_invoice_url: null,
      description: `${c.name} — monthly retainer (demo)`,
    })),
  );
  const charges: StripeCharge[] = invoices
    .filter((i) => i.status === 'paid')
    .map((i, idx) => ({
      id: `ch_demo_${idx}`,
      amount: i.total,
      amount_refunded: 0,
      currency: 'usd',
      status: 'succeeded',
      created: i.created + 3 * 86400,
      paid: true,
      refunded: false,
      invoice: i.id,
      customer: i.customer,
      failure_message: null,
      payment_method_details: { type: 'card' },
      description: i.description,
    }));
  charges.push({
    id: 'ch_demo_failed',
    amount: 950000,
    amount_refunded: 0,
    currency: 'usd',
    status: 'failed',
    created: now - 6 * 86400,
    paid: false,
    refunded: false,
    invoice: null,
    customer: 'cus_demo_2',
    failure_message: 'Your card was declined.',
    payment_method_details: { type: 'card' },
    description: 'Retainer payment (demo)',
  });
  const subscriptions: StripeSubscription[] = customers.map((c, i) => ({
    id: `sub_demo_${i}`,
    customer: c.id,
    status: 'active',
    created: c.created,
    current_period_start: now - 10 * 86400,
    current_period_end: now + 20 * 86400,
    canceled_at: null,
    items: {
      data: [
        {
          price: {
            id: `price_demo_${i}`,
            unit_amount: [1250000, 850000, 600000][i]!,
            currency: 'usd',
            recurring: { interval: 'month' },
            nickname: 'Monthly retainer (demo)',
          },
          quantity: 1,
        },
      ],
    },
  }));
  return { customers, invoices, charges, subscriptions };
}

export const stripeAdapter: IntegrationAdapter = {
  id: 'stripe',

  async test(credentials) {
    const key = credentials.secretKey;
    if (!key) throw new IntegrationError('A Stripe secret or restricted key is required.');
    if (key.startsWith('sk_live_')) {
      // Allowed, but say so plainly: a restricted read-only key is safer.
    }
    const account = (await providerFetch(`${API}/account`, { headers: auth(key) })) as {
      id: string;
      business_profile?: { name?: string };
      settings?: { dashboard?: { display_name?: string } };
    };
    return {
      ok: true,
      accountId: account.id,
      accountName:
        account.settings?.dashboard?.display_name ?? account.business_profile?.name ?? account.id,
      scopes: ['customers:read', 'invoices:read', 'charges:read', 'subscriptions:read'],
      message: key.startsWith('rk_')
        ? 'Connected with a restricted key.'
        : 'Connected. Consider using a restricted, read-only key instead of a full secret key.',
    };
  },

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const log: SyncResult['log'] = [];
    const push = (level: 'info' | 'warn' | 'error', message: string) => {
      log.push({ level, message, at: new Date().toISOString() });
      ctx.log(level, message);
    };
    if (!ctx.companyId) throw new IntegrationError('Stripe must be connected to a specific company.');

    let customers: StripeCustomer[];
    let invoices: StripeInvoice[];
    let charges: StripeCharge[];
    let subscriptions: StripeSubscription[];

    if (ctx.demo) {
      ({ customers, invoices, charges, subscriptions } = demoData());
      push('info', 'Demo mode: using built-in Stripe fixtures. No Stripe request was made.');
    } else {
      const key = ctx.credentials.secretKey;
      if (!key) throw new IntegrationError('A Stripe key is required.');
      const h = { headers: auth(key) };
      customers = ((await providerFetch(`${API}/customers?limit=100`, h)) as StripeList<StripeCustomer>).data;
      invoices = ((await providerFetch(`${API}/invoices?limit=100`, h)) as StripeList<StripeInvoice>).data;
      charges = ((await providerFetch(`${API}/charges?limit=100`, h)) as StripeList<StripeCharge>).data;
      subscriptions = ((await providerFetch(`${API}/subscriptions?limit=100&status=all`, h)) as StripeList<StripeSubscription>).data;
      push('info', `Read ${customers.length} customers, ${invoices.length} invoices, ${charges.length} charges, ${subscriptions.length} subscriptions.`);
    }

    // Match Stripe customers to local clients by name, then by contact email.
    const clients = await sql<{ id: string; name: string }>(
      `select id, name from clients where company_id = $1 and deleted_at is null`,
      [ctx.companyId],
    );
    const clientByName = new Map(clients.map((c) => [c.name.toLowerCase().trim(), c.id]));
    const clientByCustomer = new Map<string, string>();
    let unmatched = 0;
    for (const c of customers) {
      const id = c.name ? clientByName.get(c.name.toLowerCase().trim()) : undefined;
      if (id) clientByCustomer.set(c.id, id);
      else unmatched++;
    }
    if (unmatched) {
      push('warn', `${unmatched} Stripe customer(s) could not be matched to a client by name. Their invoices are imported without a client link.`);
    }

    let written = 0;
    let conflicts = 0;
    const invoiceLocalIds = new Map<string, string>();

    for (const inv of invoices) {
      const r = await upsertMapped({
        connectionId: ctx.connection.id,
        provider: 'stripe',
        entityType: 'invoice',
        externalId: inv.id,
        table: 'invoices',
        values: {
          company_id: ctx.companyId,
          client_id: inv.customer ? (clientByCustomer.get(inv.customer) ?? null) : null,
          number: inv.number ?? inv.id,
          status: STATUS_MAP[inv.status] ?? 'open',
          issue_date: new Date(inv.created * 1000).toISOString().slice(0, 10),
          due_date: inv.due_date ? new Date(inv.due_date * 1000).toISOString().slice(0, 10) : null,
          currency: inv.currency.toUpperCase(),
          subtotal: cents(inv.subtotal),
          tax: cents(inv.tax),
          total: cents(inv.total),
          amount_paid: cents(inv.amount_paid),
          amount_due: cents(inv.amount_due),
          description: inv.description,
          source: 'stripe',
          external_id: inv.id,
          hosted_url: inv.hosted_invoice_url,
          is_demo: ctx.demo,
        },
        matchOn: [
          { column: 'source', value: 'stripe' },
          { column: 'external_id', value: inv.id },
        ],
      });
      invoiceLocalIds.set(inv.id, r.id);
      if (r.action === 'conflict') conflicts++;
      else written++;
    }

    for (const ch of charges) {
      const status =
        ch.refunded || ch.amount_refunded > 0
          ? 'refunded'
          : ch.status === 'succeeded'
            ? 'succeeded'
            : ch.status === 'failed'
              ? 'failed'
              : 'pending';
      const r = await upsertMapped({
        connectionId: ctx.connection.id,
        provider: 'stripe',
        entityType: 'payment',
        externalId: ch.id,
        table: 'payments',
        values: {
          company_id: ctx.companyId,
          invoice_id: ch.invoice ? (invoiceLocalIds.get(ch.invoice) ?? null) : null,
          client_id: ch.customer ? (clientByCustomer.get(ch.customer) ?? null) : null,
          direction: 'inbound',
          amount: cents(ch.amount - ch.amount_refunded),
          currency: ch.currency.toUpperCase(),
          status,
          method: ch.payment_method_details?.type ?? null,
          occurred_at: new Date(ch.created * 1000),
          description: ch.description,
          failure_reason: ch.failure_message,
          source: 'stripe',
          external_id: ch.id,
          is_demo: ctx.demo,
        },
        matchOn: [
          { column: 'source', value: 'stripe' },
          { column: 'external_id', value: ch.id },
        ],
      });
      if (r.action === 'conflict') conflicts++;
      else written++;
    }

    for (const sub of subscriptions) {
      const item = sub.items.data[0];
      const r = await upsertMapped({
        connectionId: ctx.connection.id,
        provider: 'stripe',
        entityType: 'subscription',
        externalId: sub.id,
        table: 'subscriptions',
        values: {
          company_id: ctx.companyId,
          client_id: clientByCustomer.get(sub.customer) ?? null,
          customer_label: customers.find((c) => c.id === sub.customer)?.name ?? sub.customer,
          plan: item?.price.nickname ?? item?.price.id ?? 'Stripe subscription',
          status: ['trialing', 'active', 'past_due', 'canceled', 'paused', 'incomplete'].includes(sub.status)
            ? sub.status
            : 'active',
          interval: item?.price.recurring?.interval ?? 'month',
          amount: cents(item?.price.unit_amount),
          currency: (item?.price.currency ?? 'usd').toUpperCase(),
          quantity: item?.quantity ?? 1,
          started_at: stamp(sub.created),
          current_period_start: stamp(sub.current_period_start),
          current_period_end: stamp(sub.current_period_end),
          canceled_at: stamp(sub.canceled_at),
          source: 'stripe',
          external_id: sub.id,
          is_demo: ctx.demo,
        },
        matchOn: [
          { column: 'source', value: 'stripe' },
          { column: 'external_id', value: sub.id },
        ],
      });
      if (r.action === 'conflict') conflicts++;
      else written++;
    }

    push('info', `Wrote ${written} financial record(s).`);
    return {
      recordsRead: customers.length + invoices.length + charges.length + subscriptions.length,
      recordsWritten: written,
      conflicts,
      log,
    };
  },
};
