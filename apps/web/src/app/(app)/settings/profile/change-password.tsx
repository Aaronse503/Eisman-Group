'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FormError } from '@/components/form';
import { changePasswordAction } from '@/server/actions/auth';

export function ChangePasswordForm() {
  const router = useRouter();
  const [form, setForm] = React.useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setPending(true);
        const result = await changePasswordAction(form);
        setPending(false);
        if (result.ok) {
          toast.success('Password changed. Other devices have been signed out.');
          setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
          router.refresh();
        } else setError(result.error);
      }}
      className="space-y-4"
    >
      <FormError message={error} />
      <Field label="Current password" htmlFor="currentPassword" required>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
          required
        />
      </Field>
      <Field
        label="New password"
        htmlFor="newPassword"
        required
        hint="At least 12 characters, with an uppercase letter, a lowercase letter and a number."
      >
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
          required
        />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" required>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
          required
        />
      </Field>
      <Button type="submit" variant="primary" loading={pending}>
        <KeyRound /> Change password
      </Button>
    </form>
  );
}
