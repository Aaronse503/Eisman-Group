import { KeyRound } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChangePasswordForm } from './settings/profile/change-password';
import { SignOutButton } from '@/components/shell/sign-out-button';

/**
 * Shown in place of the application when an account is still on the temporary
 * password it was created with. Rendering it here rather than redirecting
 * means there is no route to slip past: whatever was asked for, this is what
 * comes back until a new password is set.
 */
export function MustChangePassword({ name, email }: { name: string; email: string }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-[var(--accent)]" />
            Choose a password to continue
          </CardTitle>
          <CardDescription>
            {name} ({email}) is still on the temporary password this account was created with. Set
            your own below — the rest of the system stays locked until you do.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ChangePasswordForm />
          <div className="border-t border-[var(--border)] pt-4 text-sm text-[var(--fg-muted)]">
            Not you? <SignOutButton variant="link" className="px-1" /> instead.
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
