'use client';

import { useFormStatus } from 'react-dom';
import { Loader2, TriangleAlert, CircleCheck, Info } from 'lucide-react';

/**
 * The console's form and layout primitives.
 *
 * Part B is essentially forty forms. Without a shared kit they drift — one
 * screen's inputs a little taller, another's error in a different colour — and
 * the console starts to feel like several products. Everything here uses the
 * warm parchment tokens in `globals.css`, which are inherited from Empiria's
 * existing admin so staff move between the two without relearning anything.
 */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-border bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${className}`}
    >
      {title && (
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary';

export const errorInputClass =
  'w-full rounded-md border border-destructive bg-destructive/5 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-destructive';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className = '',
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1 text-[12px] font-medium text-destructive">{error}</p>}
    </div>
  );
}

export function Input({
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return <input {...props} className={error ? errorInputClass : inputClass} />;
}

export function Textarea({
  error,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <textarea {...props} className={`${error ? errorInputClass : inputClass} resize-y leading-relaxed`} />
  );
}

export function Select({
  error,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select {...props} className={error ? errorInputClass : inputClass}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" {...props} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
      <span>
        <span className="block text-[13px] font-medium text-foreground">{label}</span>
        {hint && <span className="block text-[12px] leading-relaxed text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function Button({
  variant = 'primary',
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const styles: Record<string, string> = {
    primary: 'bg-primary text-primary-foreground hover:bg-[#d6420f] disabled:bg-muted-foreground/40',
    secondary: 'border border-border bg-background text-foreground hover:border-primary hover:text-primary',
    ghost: 'text-muted-foreground hover:bg-secondary hover:text-foreground',
    danger: 'border border-destructive/40 text-destructive hover:bg-destructive/10',
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * A submit button that knows the form is in flight.
 *
 * `useFormStatus` reads it from the enclosing form, so no page has to thread a
 * `pending` boolean down to its buttons — and none of them can forget to.
 */
export function SubmitButton({
  children = 'Save',
  variant = 'primary',
  className = '',
}: {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: 'success' | 'error' | 'info';
  children: React.ReactNode;
}) {
  const Icon = tone === 'success' ? CircleCheck : tone === 'error' ? TriangleAlert : Info;
  const styles: Record<string, string> = {
    success: 'border-primary/30 bg-primary/8 text-foreground',
    error: 'border-destructive/40 bg-destructive/8 text-destructive',
    info: 'border-border bg-secondary text-muted-foreground',
  };
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mb-5 flex items-start gap-2.5 rounded-md border p-3.5 text-[13px] leading-relaxed ${styles[tone]}`}
    >
      <Icon size={16} className="mt-px shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

const BADGE_STYLES: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-700',
  open: 'bg-emerald-100 text-emerald-700',
  active: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-black/8 text-muted-foreground',
  inactive: 'bg-black/8 text-muted-foreground',
  closed: 'bg-amber-100 text-amber-700',
  sold_out: 'bg-amber-100 text-amber-700',
  archived: 'bg-black/8 text-muted-foreground',
  cancelled: 'bg-red-100 text-red-600',
};

export function Badge({ value }: { value: string }) {
  const style = BADGE_STYLES[value] ?? 'bg-black/8 text-muted-foreground';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${style}`}
    >
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-border">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
