'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/misc';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
  span,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  span?: boolean;
}) {
  return (
    <div className={cn('space-y-1.5', span && 'sm:col-span-2', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-[var(--fg-subtle)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-[var(--border)] pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="text-sm text-[var(--fg-muted)]">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger-bg)] px-3 py-2.5 text-sm text-[var(--danger)]"
    >
      {message}
    </div>
  );
}

export function FormActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] pt-5 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}
