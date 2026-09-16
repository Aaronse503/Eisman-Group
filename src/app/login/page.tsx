import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/actor';
import { getEnv } from '@/lib/env';
import { ensureMigrated } from '@/lib/db/migrate';
import { sql } from '@/lib/db/client';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  await ensureMigrated();
  if (await getActor()) redirect('/');

  const env = getEnv();
  // Demo credentials are only ever surfaced for accounts explicitly flagged as
  // demo accounts, and only while demo mode is enabled.
  const demoUsers =
    env.DEMO_MODE && !env.DISABLE_DEMO_DATA
      ? await sql<{ email: string; name: string; title: string | null }>(
          `select u.email, u.name, u.title
           from users u where u.is_demo = true and u.status = 'active'
           order by u.created_at limit 6`,
        )
      : [];

  const [{ count } = { count: 0 }] = await sql<{ count: number }>(
    `select count(*)::int as count from users`,
  );

  return (
    <main
      id="main"
      className="grid grid-cols-1 min-h-dvh lg:grid-cols-[1.05fr_1fr]"
      style={{ background: 'var(--bg)' }}
    >
      <section
        className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ background: 'var(--color-emerald-950)' }}
      >
        <div
          aria-hidden
          className="absolute -top-32 -right-24 size-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'var(--color-gold-600)' }}
        />
        <div
          aria-hidden
          className="absolute -bottom-40 -left-20 size-[28rem] rounded-full opacity-25 blur-3xl"
          style={{ background: 'var(--color-emerald-600)' }}
        />
        <div className="relative flex items-center gap-3">
          <span
            className="flex size-10 items-center justify-center rounded-xl text-sm font-bold"
            style={{ background: 'var(--color-gold-600)', color: '#1b1503' }}
          >
            EH
          </span>
          <span className="font-semibold text-white">Eisman Holdings</span>
        </div>
        <div className="relative max-w-md space-y-5">
          <h1 className="text-4xl leading-tight font-semibold text-white">
            One operating system for every company you run.
          </h1>
          <p className="text-[15px] leading-relaxed text-[#9fbcae]">
            Clients, tasks, finances, partnerships, investors and the ParFax platform — in a single
            place, with consolidated and per-company views.
          </p>
          <ul className="space-y-2.5 text-sm text-[#9fbcae]">
            {[
              'Consolidated holdings dashboard and per-company workspaces',
              'Client CRM, investor pipeline and partnership tracking',
              'Documents with cited, source-backed answers',
              'Role-based access with a tamper-evident audit trail',
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span
                  className="mt-[7px] size-1.5 shrink-0 rounded-full"
                  style={{ background: 'var(--color-gold-600)' }}
                  aria-hidden
                />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-[#6d8579]">
          Internal system · Authorized personnel only · All access is logged
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span
              className="flex size-10 items-center justify-center rounded-xl text-sm font-bold"
              style={{ background: 'var(--color-emerald-950)', color: 'var(--color-gold-600)' }}
            >
              EH
            </span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 mb-6 text-sm text-[var(--fg-muted)]">
            Eisman Holdings Command Center
          </p>
          <LoginForm demoUsers={demoUsers} noUsers={count === 0} />
        </div>
      </section>
    </main>
  );
}
