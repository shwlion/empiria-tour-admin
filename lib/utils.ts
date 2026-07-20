import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware className combiner (shadcn convention, shared across Empiria). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY_LOCALE: Record<string, string> = {
  usd: 'en-US', cad: 'en-CA', eur: 'de-DE', gbp: 'en-GB',
  aud: 'en-AU', inr: 'en-IN', jpy: 'ja-JP', mxn: 'es-MX', brl: 'pt-BR',
};

export function formatCurrency(amount: number, currency: string = 'cad'): string {
  const code = currency.toLowerCase();
  return new Intl.NumberFormat(CURRENCY_LOCALE[code] || 'en-US', {
    style: 'currency',
    currency: code.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
