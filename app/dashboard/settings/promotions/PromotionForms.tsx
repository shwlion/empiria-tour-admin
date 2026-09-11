'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Checkbox, Field, Input, Select, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import { PROMOTION_LIMITS, datePart, type PackageChoice, type PromotionRow } from '@/lib/admin/promotions';
import { deletePromotionAction, savePromotionAction, setPromotionStatusAction } from './actions';

function Result({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  return <Banner tone={state.ok ? 'success' : 'error'}>{state.message ?? 'Done.'}</Banner>;
}

export function PromotionForm({
  promotion,
  packages,
  currencies,
}: {
  promotion: PromotionRow | null;
  packages: PackageChoice[];
  currencies: string[];
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (prev: ActionResult<{ id: string }> | null, form: FormData) => {
      const result = await savePromotionAction(promotion?.id ?? null, prev, form);
      // A new code has its own page; go there rather than leave a filled-in
      // form under a success banner that invites a second, duplicate save.
      if (result.ok && !promotion && result.data?.id) router.push(`/dashboard/settings/promotions/${result.data.id}`);
      return result;
    },
    null
  );
  const [type, setType] = useState<'percent' | 'fixed'>(promotion?.discountType ?? 'percent');
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  const scoped = new Set(promotion?.scope.map((s) => s.id) ?? []);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Result state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" htmlFor="code" required error={fields.code} hint="Letters, digits and hyphens. Stored in capitals; travellers can type it either way.">
          <Input
            id="code"
            name="code"
            required
            maxLength={PROMOTION_LIMITS.code}
            defaultValue={promotion?.code ?? ''}
            placeholder="SPRING10"
            autoCapitalize="characters"
            error={!!fields.code}
            className="font-mono uppercase"
          />
        </Field>
        <Field label="Discount" htmlFor="discount_value" required error={fields.discount_value}>
          <div className="flex gap-2">
            <Select
              name="discount_type"
              aria-label="Kind of discount"
              value={type}
              onChange={(e) => setType(e.target.value === 'fixed' ? 'fixed' : 'percent')}
              className="w-auto"
            >
              <option value="percent">Percent off</option>
              <option value="fixed">Amount off</option>
            </Select>
            <Input
              id="discount_value"
              name="discount_value"
              required
              inputMode={type === 'percent' ? 'numeric' : 'decimal'}
              defaultValue={
                promotion
                  ? promotion.discountType === 'percent'
                    ? String(promotion.discountValue)
                    : (promotion.discountValue / 100).toFixed(2)
                  : ''
              }
              placeholder={type === 'percent' ? '10' : '50.00'}
              error={!!fields.discount_value}
            />
          </div>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Currency"
          htmlFor="currency"
          error={fields.currency}
          hint={type === 'fixed' ? 'An amount off is only valid in this currency.' : 'A percentage works in every currency.'}
        >
          <Select id="currency" name="currency" defaultValue={promotion?.currency ?? currencies[0] ?? 'CAD'} error={!!fields.currency}>
            {currencies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Valid from" htmlFor="valid_from" error={fields.valid_from} hint="Blank means now.">
          <Input id="valid_from" name="valid_from" type="date" defaultValue={datePart(promotion?.validFrom ?? null)} error={!!fields.valid_from} />
        </Field>
        <Field label="Valid until" htmlFor="valid_until" error={fields.valid_until} hint="Inclusive. Blank means no end.">
          <Input id="valid_until" name="valid_until" type="date" defaultValue={datePart(promotion?.validUntil ?? null)} error={!!fields.valid_until} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Total uses" htmlFor="usage_limit" error={fields.usage_limit} hint="Blank for unlimited. A cancelled booking gives its use back.">
          <Input id="usage_limit" name="usage_limit" type="number" min={1} step={1} defaultValue={promotion?.usageLimit ?? ''} error={!!fields.usage_limit} />
        </Field>
        <Field label="Uses per person" htmlFor="per_user_limit" error={fields.per_user_limit} hint="Matched on the account, or the lead email when booking as a guest.">
          <Input id="per_user_limit" name="per_user_limit" type="number" min={1} step={1} defaultValue={promotion?.perUserLimit ?? ''} error={!!fields.per_user_limit} />
        </Field>
      </div>

      <Field label="Note to staff" htmlFor="description" error={fields.description} hint="Never shown to travellers.">
        <Textarea id="description" name="description" rows={2} maxLength={PROMOTION_LIMITS.description} defaultValue={promotion?.description ?? ''} error={!!fields.description} />
      </Field>

      <fieldset>
        <legend className="mb-1.5 block text-[13px] font-medium text-foreground">Which tours</legend>
        <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
          Tick none and the code works on every tour, including ones created later.
        </p>
        {packages.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">There are no tours yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {packages.map((p) => (
              <Checkbox
                key={p.id}
                name="package_ids"
                value={p.id}
                defaultChecked={scoped.has(p.id)}
                label={p.title}
                hint={p.status === 'published' ? undefined : p.status}
              />
            ))}
          </div>
        )}
      </fieldset>

      <div>
        <SubmitButton>{promotion ? 'Save' : 'Create the code'}</SubmitButton>
      </div>
    </form>
  );
}

export function StatusForm({ id, status, code }: { id: string; status: 'active' | 'inactive'; code: string }) {
  const next = status === 'active' ? 'inactive' : 'active';
  const [state, formAction] = useActionState(setPromotionStatusAction.bind(null, id), null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="status" value={next} />
      <SubmitButton variant="secondary">{status === 'active' ? `Switch ${code} off` : `Switch ${code} on`}</SubmitButton>
      {state && <p className={`text-[12px] ${state.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{state.message}</p>}
    </form>
  );
}

export function DeleteForm({ id, blocked }: { id: string; blocked: string | null }) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async () => {
      const result = await deletePromotionAction(id);
      if (result.ok) router.push('/dashboard/settings/promotions');
      return result;
    },
    null
  );
  if (blocked) return <p className="text-[12px] leading-relaxed text-muted-foreground">{blocked}</p>;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <SubmitButton variant="danger">Delete</SubmitButton>
      {state && !state.ok && <p className="text-[12px] text-destructive">{state.message}</p>}
    </form>
  );
}
