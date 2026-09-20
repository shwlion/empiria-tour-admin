'use client';

import { useActionState, useState } from 'react';
import { Badge, Banner, Button, Card, Field, Input, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { PlacementRecord } from '@/lib/admin/placements';
import { approvePlacementAction, rejectPlacementAction, cancelPlacementAction } from './actions';

export type QueueRow = {
  placement: PlacementRecord;
  days: number;
  suggestedCents: number;
  rateCentsPerWeek: number;
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(cents / 100);

/** A date as the seller reads it, not as ISO stores it. */
const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * One request, with the decision attached.
 *
 * The approve form is open by default on anything still pending, because that
 * is what this page is for; rejecting asks for a reason in the same row rather
 * than a dialog, so the reason is written while the request is still on screen.
 */
function Row({ row, currency }: { row: QueueRow; currency: string }) {
  const p = row.placement;
  const [mode, setMode] = useState<'none' | 'approve' | 'reject' | 'cancel'>('none');

  const [approveState, approve] = useActionState<ActionResult | null, FormData>(
    approvePlacementAction.bind(null, p.id),
    null
  );
  const [rejectState, reject] = useActionState<ActionResult | null, FormData>(
    rejectPlacementAction.bind(null, p.id),
    null
  );
  const [cancelState, cancel] = useActionState<ActionResult | null, FormData>(
    cancelPlacementAction.bind(null, p.id),
    null
  );
  const state = approveState ?? rejectState ?? cancelState;

  // An approval that was never paid and whose hold date has passed is holding
  // days against everybody else. Nothing expires it automatically, so the
  // console is what makes it visible.
  const stale =
    p.status === 'approved' && p.holdUntil != null && p.holdUntil < new Date().toISOString().slice(0, 10);

  return (
    <div className="border-b border-border px-4 py-4 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{p.cardTitle}</span>
            <Badge value={p.status} />
            {stale && <span className="text-[12px] font-medium text-destructive">hold expired</span>}
          </div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {p.partnerName} · {day(p.startsOn)} – {day(p.endsOn)} · {row.days} {row.days === 1 ? 'day' : 'days'}
          </p>
          <p className="mt-2 text-[13px] text-foreground">
            <span className="font-medium">{p.title}</span>
            {p.kicker && <span className="text-muted-foreground"> · {p.kicker}</span>}
          </p>
          <p className="text-[13px] text-muted-foreground">{p.description}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Links to <code className="font-mono">{p.linkUrl}</code>
          </p>
          {p.note && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              <span className="font-medium">Note:</span> {p.note}
            </p>
          )}
        </div>

        <div className="text-right">
          <p className="tabular-nums font-semibold text-foreground">
            {p.priceCents != null ? money(p.priceCents, p.currency) : money(row.suggestedCents, currency)}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {p.priceCents != null ? 'agreed' : 'at the published rate'}
          </p>
          {p.paidAt && (
            <p className="mt-1 text-[12px] font-medium text-foreground">
              paid {day(p.paidAt.slice(0, 10))}
            </p>
          )}
        </div>
      </div>

      {state && (
        <div className="mt-3">
          <Banner tone={state.ok ? 'success' : 'error'}>{state.message}</Banner>
        </div>
      )}

      {p.status === 'requested' && mode === 'none' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setMode('approve')}>Approve</Button>
          <Button variant="secondary" onClick={() => setMode('reject')}>
            Reject
          </Button>
        </div>
      )}

      {(p.status === 'approved' || p.status === 'paid') && mode === 'none' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setMode('cancel')}>
            {p.status === 'paid' ? 'Cancel this paid placement' : 'Release these days'}
          </Button>
        </div>
      )}

      {mode === 'approve' && (
        <form action={approve} className="mt-3 grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-3">
          <Field
            label="Price"
            htmlFor={`price-${p.id}`}
            hint={`${money(row.rateCentsPerWeek, currency)} per week × ${row.days} days`}
          >
            <Input
              id={`price-${p.id}`}
              name="price_cents"
              inputMode="decimal"
              defaultValue={(row.suggestedCents / 100).toFixed(2)}
            />
          </Field>
          <Field
            label="Hold until"
            htmlFor={`hold-${p.id}`}
            hint="After this date the console flags it as unpaid. Nothing expires on its own."
          >
            <Input id={`hold-${p.id}`} name="hold_until" type="date" />
          </Field>
          <Field label="Note to the partner" htmlFor={`note-${p.id}`}>
            <Input id={`note-${p.id}`} name="note" placeholder="Optional" />
          </Field>
          <div className="flex gap-2 sm:col-span-3">
            <SubmitButton>Approve and hold the dates</SubmitButton>
            <Button variant="secondary" onClick={() => setMode('none')}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {mode === 'reject' && (
        <form action={reject} className="mt-3 grid gap-3 rounded-lg border border-border bg-background p-3">
          <Field label="Why" htmlFor={`reason-${p.id}`} hint="The partner sees this.">
            <Textarea id={`reason-${p.id}`} name="note" rows={2} required />
          </Field>
          <div className="flex gap-2">
            <SubmitButton>Reject</SubmitButton>
            <Button variant="secondary" onClick={() => setMode('none')}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {mode === 'cancel' && (
        <form action={cancel} className="mt-3 grid gap-3 rounded-lg border border-border bg-background p-3">
          {p.status === 'paid' && (
            <Banner tone="info">
              This placement has been paid for. Cancelling it here stops the card running but refunds
              nothing — settle that with the partner directly.
            </Banner>
          )}
          <Field label="Note" htmlFor={`cnote-${p.id}`}>
            <Input id={`cnote-${p.id}`} name="note" placeholder="Optional" />
          </Field>
          <div className="flex gap-2">
            <SubmitButton>{p.status === 'paid' ? 'Cancel the placement' : 'Release the days'}</SubmitButton>
            <Button variant="secondary" onClick={() => setMode('none')}>
              Keep it
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function PlacementQueue({ rows, currency }: { rows: QueueRow[]; currency: string }) {
  const pending = rows.filter((r) => r.placement.status === 'requested');
  const settled = rows.filter((r) => r.placement.status !== 'requested');

  return (
    <div className="grid gap-5">
      {pending.length > 0 && (
        <Card title="Awaiting a decision" description="Oldest first — whoever asked first should be answered first.">
          <div className="-mx-4 -mb-4">
            {pending.map((r) => (
              <Row key={r.placement.id} row={r} currency={currency} />
            ))}
          </div>
        </Card>
      )}
      {settled.length > 0 && (
        <Card title="Decided" description="Approved, paid, rejected and released placements, newest first.">
          <div className="-mx-4 -mb-4">
            {settled.map((r) => (
              <Row key={r.placement.id} row={r} currency={currency} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
