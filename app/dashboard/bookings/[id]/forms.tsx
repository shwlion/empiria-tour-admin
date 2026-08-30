'use client';

import { useActionState } from 'react';
import { Banner, Field, Input, Select, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import {
  recordManualPaymentAction,
  saveInternalNotesAction,
  saveSupplierCostAction,
} from './actions';

/**
 * The three small forms on the booking detail page. Split from the page so the
 * page itself stays a server component and only these islands ship to the
 * browser.
 */

function ResultLine({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <Banner tone={state.ok ? 'success' : 'error'}>
      {state.ok ? (state.message ?? 'Saved.') : state.message}
    </Banner>
  );
}

export function NotesForm({ bookingId, notes }: { bookingId: string; notes: string | null }) {
  const [state, action] = useActionState(saveInternalNotesAction.bind(null, bookingId), null);
  return (
    <form action={action}>
      <ResultLine state={state} />
      <Field
        label="Internal notes"
        htmlFor="notes_internal"
        hint="Only staff see these. They also appear on the departure manifest."
      >
        <Textarea
          id="notes_internal"
          name="notes_internal"
          rows={4}
          defaultValue={notes ?? ''}
          placeholder="Anything the team should know about this booking."
        />
      </Field>
      <div className="mt-3 flex justify-end">
        <SubmitButton>Save notes</SubmitButton>
      </div>
    </form>
  );
}

export function ManualPaymentForm({
  bookingId,
  currency,
  outstandingCents,
}: {
  bookingId: string;
  currency: string;
  outstandingCents: number;
}) {
  const [state, action] = useActionState(recordManualPaymentAction.bind(null, bookingId), null);
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  return (
    <form action={action}>
      <ResultLine state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Kind" htmlFor="kind" error={fields.kind} required>
          <Select id="kind" name="kind" defaultValue="balance" error={Boolean(fields.kind)}>
            <option value="deposit">Deposit</option>
            <option value="balance">Balance</option>
            <option value="full">Full payment</option>
            <option value="manual">Other payment</option>
            <option value="refund">Refund</option>
          </Select>
        </Field>
        <Field
          label={`Amount (${currency.toUpperCase()})`}
          htmlFor="amount"
          error={fields.amount}
          required
          hint={
            outstandingCents > 0
              ? `${(outstandingCents / 100).toFixed(2)} outstanding.`
              : 'Nothing outstanding.'
          }
        >
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            error={Boolean(fields.amount)}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Field
          label="Note"
          htmlFor="note"
          hint="How it arrived — e.g. e-transfer 14 Sep. Kept in the audit trail."
        >
          <Input id="note" name="note" placeholder="Optional" />
        </Field>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        For money that arrived outside Stripe. Card payments record themselves through the
        webhook — never re-enter one here, or it will be counted twice.
      </p>
      <div className="mt-3 flex justify-end">
        <SubmitButton>Record payment</SubmitButton>
      </div>
    </form>
  );
}

export function SupplierCostForm({
  bookingId,
  currency,
  supplierCostCents,
}: {
  bookingId: string;
  currency: string;
  supplierCostCents: number | null;
}) {
  const [state, action] = useActionState(saveSupplierCostAction.bind(null, bookingId), null);
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  return (
    <form action={action}>
      <ResultLine state={state} />
      <Field
        label={`Supplier cost (${currency.toUpperCase()})`}
        htmlFor="supplier_cost"
        error={fields.supplier_cost}
        hint="What the supplier charges Empiria for this booking — §4.6. The revenue share cannot be calculated until it is entered."
      >
        <Input
          id="supplier_cost"
          name="supplier_cost"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={supplierCostCents != null ? (supplierCostCents / 100).toFixed(2) : ''}
          error={Boolean(fields.supplier_cost)}
        />
      </Field>
      <div className="mt-3 flex justify-end">
        <SubmitButton variant="secondary">Save cost</SubmitButton>
      </div>
    </form>
  );
}
