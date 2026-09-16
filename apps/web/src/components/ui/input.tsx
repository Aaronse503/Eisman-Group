import * as React from 'react';
import { cn } from '@/lib/utils';

const base =
  'w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-[var(--danger)]';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(base, 'h-9', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(base, 'resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';

/**
 * Native select styled to match the rest of the system. Preferred over a
 * Radix Select for dense filter bars: it is keyboard- and screen-reader
 * native, and behaves correctly inside scrolling toolbars on mobile.
 */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(base, 'h-9 appearance-none pr-8', className)} {...props}>
      {children}
    </select>
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  </div>
));
NativeSelect.displayName = 'NativeSelect';
