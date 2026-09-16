'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, LogIn, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/misc';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type Values = z.infer<typeof schema>;

export function LoginForm({
  demoUsers,
  noUsers,
}: {
  demoUsers: { email: string; name: string; title: string | null }[];
  noUsers: boolean;
}) {
  const searchParams = useSearchParams();
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Return to whatever was originally asked for. Only a path within this
  // application is accepted, so the parameter cannot be used to bounce
  // somebody to another site after they sign in.
  const requested = searchParams.get('next');
  const destination = requested && /^\/(?!\/)/.test(requested) ? requested : '/';
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    // Posted to the route handler rather than through a Server Action: the
    // response is an ordinary one, so the session cookie is stored before this
    // promise resolves and the navigation that follows always carries it.
    const response = await fetch('/api/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (response.ok) {
      // A full load, so the whole tree renders for the newly signed-in person.
      window.location.assign(destination);
      return;
    }
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setServerError(body?.error ?? 'Could not sign in. Try again.');
  });

  if (noUsers) {
    return (
      <div className="space-y-4 rounded-[var(--radius-card)] border border-[var(--warning)]/40 bg-[var(--warning-bg)] p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Terminal className="size-4" /> No accounts exist yet
        </p>
        <p className="text-sm text-[var(--fg-muted)]">
          The database is migrated but empty. Create the first accounts by running the seed script:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-[var(--surface)] p-3 font-mono text-xs">
          npm run db:seed
        </pre>
        <p className="text-xs text-[var(--fg-muted)]">
          See <code className="font-mono">SETUP.md</code> for creating a production owner account
          instead of demo accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2.5 text-sm text-[var(--danger)]"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
          {errors.email ? (
            <p id="email-error" className="text-xs text-[var(--danger)]">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          {errors.password ? (
            <p id="password-error" className="text-xs text-[var(--danger)]">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
          <LogIn /> Sign in
        </Button>
      </form>

      {demoUsers.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--gold)]/35 bg-[var(--gold-soft)] p-4">
          <p className="text-sm font-medium">Demo accounts</p>
          <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
            Seeded demo users. Password for all of them:{' '}
            <code className="rounded bg-[var(--surface)] px-1 py-0.5 font-mono">demo1234!</code>
          </p>
          <ul className="mt-3 space-y-1">
            {demoUsers.map((u) => (
              <li key={u.email}>
                <button
                  type="button"
                  onClick={() => {
                    setValue('email', u.email);
                    setValue('password', 'demo1234!');
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--surface)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-[var(--fg-muted)]">{u.email}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--fg-subtle)]">
                    {u.title ?? ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
