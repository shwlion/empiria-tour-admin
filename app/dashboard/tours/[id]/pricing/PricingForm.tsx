'use client';

import { useActionState, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Banner, Button, Card, Field, Input, Select, SubmitButton } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { CurrencyPriceRow, PackageRecord } from '@/lib/admin/packages';
import { savePricingAction } from '../actions';

const money = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));

type Row = CurrencyPriceRow & { key: number };
let nextKey = 0;

export default function PricingForm({
  pkg,
  prices,
  currencies,
  policies,
  canEdit,
}: {
  pkg: PackageRecord;
  prices: CurrencyPriceRow[];
  currencies: { code: string; name: string; symbol: string }[];
  policies: { id: string; name: string; kind: string }[];
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    savePricingAction.bind(null, pkg.id),
    null
  );
  const [rows, setRows] = useState<Row[]>(() => prices.map((p) => ({ ...p, key: nextKey++ })));
  const [depositType, setDepositType] = useState(pkg.depositType);
  const err = (k: string) => (state && !state.ok ? state.fields?.[k] : undefined);

  const unused = currencies.filter((c) => !rows.some((r) => r.currency === c.code));

  if (!canEdit) {
    return (
      <Banner tone="info">
        Pricing is set by an administrator. Your role can edit everything else about this tour.
      </Banner>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      <Card
        title="Base price"
        description="The default, in the tour's own currency. Individual departures can override it, and the per-currency table below overrides it for travellers browsing in another currency."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Currency" htmlFor="currency">
            <Select id="currency" name="currency" defaultValue={pkg.currency}>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Per adult" htmlFor="base_price" required>
            <Input id="base_price" name="base_price" type="number" step="0.01" min={0} defaultValue={money(pkg.basePriceCents)} />
          </Field>
          <Field label="Per child" htmlFor="child_price" hint="Blank charges the adult price.">
            <Input id="child_price" name="child_price" type="number" step="0.01" min={0} defaultValue={money(pkg.childPriceCents)} />
          </Field>
          <Field label="Per infant" htmlFor="infant_price" hint="Blank means free. Infants take no seat.">
            <Input id="infant_price" name="infant_price" type="number" step="0.01" min={0} defaultValue={money(pkg.infantPriceCents)} />
          </Field>
          <Field
            label="Single supplement"
            htmlFor="single_supplement"
            hint="Charged when one traveller occupies a room built for two."
          >
            <Input
              id="single_supplement" name="single_supplement" type="number" step="0.01" min={0}
              defaultValue={money(pkg.singleSupplementCents)}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Deposit"
        description="What is due at booking. The rest becomes a balance with its own due date, counted back from the departure."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Deposit" htmlFor="deposit_type">
            <Select
              id="deposit_type" name="deposit_type" value={depositType}
              onChange={(e) => setDepositType(e.target.value)}
            >
              <option value="none">Pay in full</option>
              <option value="percent">A percentage</option>
              <option value="fixed">A fixed amount</option>
            </Select>
          </Field>

          {depositType === 'percent' && (
            <Field label="Percent" htmlFor="deposit_percent" error={err('deposit_percent')}>
              <Input
                id="deposit_percent" name="deposit_percent" type="number" min={0} max={100}
                defaultValue={pkg.depositValue} error={Boolean(err('deposit_percent'))}
              />
            </Field>
          )}
          {depositType === 'fixed' && (
            <Field label="Amount" htmlFor="deposit_amount">
              <Input
                id="deposit_amount" name="deposit_amount" type="number" step="0.01" min={0}
                defaultValue={money(pkg.depositValue)}
              />
            </Field>
          )}

          {depositType !== 'none' && (
            <Field
              label="Balance due, days before"
              htmlFor="balance_due_days_before"
              hint="30 is typical."
            >
              <Input
                id="balance_due_days_before" name="balance_due_days_before" type="number" min={0}
                defaultValue={pkg.balanceDueDaysBefore}
              />
            </Field>
          )}
        </div>
      </Card>

      <Card
        title="Other currencies"
        description="Empiria charges in the currency being browsed and never converts at read time, so a currency with no row here simply is not for sale in that currency."
      >
        {rows.length === 0 && (
          <p className="mb-4 rounded-md bg-secondary p-3 text-[13px] leading-relaxed text-muted-foreground">
            Only sold in {pkg.currency}. Add a row to open another currency.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <div key={row.key} className="grid items-end gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[110px_repeat(4,1fr)_auto]">
              <Field label="Currency" htmlFor={`price_currency_${row.key}`}>
                <Select
                  id={`price_currency_${row.key}`} name="price_currency" value={row.currency}
                  onChange={(e) =>
                    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, currency: e.target.value } : r)))
                  }
                >
                  <option value={row.currency}>{row.currency}</option>
                  {unused.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Adult" htmlFor={`price_base_${row.key}`}>
                <Input
                  id={`price_base_${row.key}`} name="price_base" type="number" step="0.01" min={0}
                  value={money(row.basePriceCents)}
                  onChange={(e) =>
                    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, basePriceCents: Math.round(Number(e.target.value) * 100) } : r)))
                  }
                />
              </Field>
              <Field label="Child" htmlFor={`price_child_${row.key}`}>
                <Input
                  id={`price_child_${row.key}`} name="price_child" type="number" step="0.01" min={0}
                  value={money(row.childPriceCents)}
                  onChange={(e) =>
                    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, childPriceCents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) } : r)))
                  }
                />
              </Field>
              <Field label="Infant" htmlFor={`price_infant_${row.key}`}>
                <Input
                  id={`price_infant_${row.key}`} name="price_infant" type="number" step="0.01" min={0}
                  value={money(row.infantPriceCents)}
                  onChange={(e) =>
                    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, infantPriceCents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) } : r)))
                  }
                />
              </Field>
              <Field label="Single supp." htmlFor={`price_single_${row.key}`}>
                <Input
                  id={`price_single_${row.key}`} name="price_single" type="number" step="0.01" min={0}
                  value={money(row.singleSupplementCents)}
                  onChange={(e) =>
                    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, singleSupplementCents: Math.round(Number(e.target.value) * 100) } : r)))
                  }
                />
              </Field>
              <Button
                type="button" variant="ghost" aria-label={`Remove ${row.currency}`}
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        {unused.length > 0 && (
          <Button
            type="button" variant="secondary" className="mt-4"
            onClick={() =>
              setRows((rs) => [
                ...rs,
                {
                  key: nextKey++, currency: unused[0].code, basePriceCents: 0,
                  childPriceCents: null, infantPriceCents: null,
                  singleSupplementCents: 0, depositValue: null,
                },
              ])
            }
          >
            <Plus size={14} aria-hidden="true" />
            Add a currency
          </Button>
        )}
      </Card>

      <Card title="Cancellation policy" description="Shown on the tour page and attached to every booking made on it.">
        <Field label="Policy" htmlFor="cancellation_policy_id">
          <Select id="cancellation_policy_id" name="cancellation_policy_id" defaultValue={pkg.cancellationPolicyId ?? ''}>
            <option value="">None — the site default applies</option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.kind.replace(/_/g, ' ')})
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <div className="flex justify-end">
        <SubmitButton>Save pricing</SubmitButton>
      </div>
    </form>
  );
}
