import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-transparent bg-[var(--neutral-bg)] text-[var(--neutral)]',
        success: 'border-transparent bg-[var(--success-bg)] text-[var(--success)]',
        warning: 'border-transparent bg-[var(--warning-bg)] text-[var(--warning)]',
        danger: 'border-transparent bg-[var(--danger-bg)] text-[var(--danger)]',
        info: 'border-transparent bg-[var(--info-bg)] text-[var(--info)]',
        accent: 'border-transparent bg-[var(--accent-soft)] text-[var(--accent-soft-fg)]',
        gold: 'border-transparent bg-[var(--gold-soft)] text-[var(--gold)]',
        outline: 'border-[var(--border-strong)] text-[var(--fg-muted)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
