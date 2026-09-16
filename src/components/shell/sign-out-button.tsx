'use client';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/server/actions/shell';

export function SignOutButton({
  variant = 'ghost',
  className,
  label = 'Sign out',
}: {
  variant?: 'ghost' | 'link' | 'secondary';
  className?: string;
  label?: string;
}) {
  return (
    <Button type="button" variant={variant} className={className} onClick={() => void signOutAction()}>
      {label}
    </Button>
  );
}
