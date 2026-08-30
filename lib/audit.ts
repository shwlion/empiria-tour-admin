import type { Db } from './supabase';
import type { StaffUser } from './auth';

/**
 * The audit trail — B3's "who changed what and when".
 *
 * Written from the same server action as the change itself rather than from a
 * database trigger, on purpose: a trigger can see the rows but not the person.
 * The console acts as `service_role`, so at the database level every staff edit
 * looks identical. The only place the actor is actually known is here.
 *
 * Deliberately best-effort. A failed audit write must not roll back a
 * successful edit — losing the record of a change is bad, losing the change is
 * worse — so failures are logged and swallowed. If the trail ever needs to be
 * load-bearing, that is a trigger plus a session variable, not a try/catch.
 */

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'archive'
  | 'generate' | 'open_sales' | 'close_sales' | 'record_payment';

export type AuditEntry = {
  entity: string;
  entityId?: string | null;
  action: AuditAction;
  /** Row state before the change. Omit on create. */
  before?: unknown;
  /** Row state after. Omit on delete. */
  after?: unknown;
  /** One line a human can read in a list without opening the diff. */
  summary?: string;
};

export async function recordAudit(
  db: Db,
  actor: Pick<StaffUser, 'id' | 'email'>,
  entry: AuditEntry
): Promise<void> {
  try {
    await db.from('audit_log').insert({
      actor_id: actor.id,
      actor_email: actor.email,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      action: entry.action,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      summary: entry.summary ?? null,
    });
  } catch (error) {
    console.error('[audit] failed to record', entry.entity, entry.action, error);
  }
}

/**
 * Narrow a row to the fields that actually changed.
 *
 * Storing the whole row twice makes the trail unreadable — the interesting part
 * of "someone edited a package" is the two fields they touched, not the forty
 * they did not. Returns null when nothing differs, so callers can skip the
 * audit entry entirely rather than record a change that never happened.
 */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>
): { before: Partial<T>; after: Partial<T> } | null {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  let changed = false;

  for (const key of Object.keys(after) as (keyof T)[]) {
    const next = after[key];
    const prev = before[key];
    if (JSON.stringify(next) === JSON.stringify(prev)) continue;
    b[key] = prev;
    a[key] = next;
    changed = true;
  }

  return changed ? { before: b, after: a } : null;
}
