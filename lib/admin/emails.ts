import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * The send log — Part C's answer to "did they actually get it?".
 *
 * Every message the platform has queued against a booking, what happened to it,
 * and the wording that genuinely went out. The snapshot matters: templates are
 * editable, so reading today's template tells you what *would* be sent now, not
 * what was sent in March. `subject_snapshot` and `body_snapshot` are written at
 * send time and never touched again.
 */

export const EMAIL_STATUSES = ['queued', 'sending', 'sent', 'failed', 'cancelled'] as const;

/** What staff may send again by hand. Reminders are the scan's job, not a button's. */
export const RESENDABLE = [
  { key: 'booking_confirmed', label: 'Booking confirmation' },
  { key: 'deposit_taken', label: 'Deposit acknowledgement' },
  { key: 'balance_due', label: 'Balance reminder' },
  { key: 'balance_paid', label: 'Paid-in-full confirmation' },
  { key: 'pre_departure', label: 'Pre-departure information' },
] as const;

export type EmailRow = {
  id: string;
  templateKey: string;
  toEmail: string;
  toName: string | null;
  status: string;
  scheduledFor: string;
  createdAt: string;
  sentAt: string | null;
  attempts: number;
  lastError: string | null;
  subjectSnapshot: string | null;
  providerRef: string | null;
};

export async function listEmailsForBooking(bookingId: string): Promise<EmailRow[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from('email_messages')
    // One literal string, not a concatenation: supabase-js infers the row type
    // from the select at compile time, and a `+` between two fragments defeats
    // that inference entirely.
    .select('id, template_key, to_email, to_name, status, scheduled_for, created_at, sent_at, attempts, last_error, subject_snapshot, provider_ref')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((m) => ({
    id: m.id,
    templateKey: m.template_key,
    toEmail: m.to_email,
    toName: m.to_name,
    status: m.status,
    scheduledFor: m.scheduled_for,
    createdAt: m.created_at,
    sentAt: m.sent_at,
    attempts: m.attempts,
    lastError: m.last_error,
    subjectSnapshot: m.subject_snapshot,
    providerRef: m.provider_ref,
  }));
}

/** Whether anything can actually leave the outbox yet, for the banner. */
export async function mailIsFlowing(): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;
  const { count } = await db
    .from('email_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent');
  return (count ?? 0) > 0;
}
