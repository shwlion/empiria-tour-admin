'use client';

import { useActionState, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Banner, Button, Card, Field, Input, Select, SubmitButton, Textarea,
} from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { PlatformSettings, TaxRuleRow } from '@/lib/admin/settings';
import { saveSettingsAction } from './actions';

type Props = {
  settings: PlatformSettings;
  currencies: { code: string; name: string }[];
  gaps: string[];
  canEdit: boolean;
};

let nextRowId = 0;
const withId = (rules: TaxRuleRow[]) => rules.map((r) => ({ ...r, _id: nextRowId++ }));

export default function SettingsForm({ settings, currencies, gaps, canEdit }: Props) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveSettingsAction,
    null
  );
  const [rules, setRules] = useState(() => withId(settings.taxRates));

  const addr = settings.contactAddress;
  const fieldError = (k: string) => (state && !state.ok ? state.fields?.[k] : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      {gaps.length > 0 && (
        <Banner tone="info">
          <p className="font-medium text-foreground">
            The storefront is missing {gaps.length} {gaps.length === 1 ? 'thing' : 'things'} from
            this page:
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Banner>
      )}

      <Card
        title="Who is selling"
        description="Rendered in the footer of every public page, on the booking flow before anyone reserves, and on receipts. Part D of the agreement requires all three."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" htmlFor="company_name" required>
            <Input
              id="company_name"
              name="company_name"
              defaultValue={settings.companyName ?? ''}
              placeholder="Empiria World Inc."
            />
          </Field>
          <Field
            label="Registration number"
            htmlFor="registration_number"
            required
            hint="Travel Industry Act registration. Shown site-wide."
          >
            <Input
              id="registration_number"
              name="registration_number"
              defaultValue={settings.registrationNumber ?? ''}
              placeholder="TICO 50012345"
            />
          </Field>
          <Field
            label="Statutory notice"
            htmlFor="statutory_notice"
            className="sm:col-span-2"
            hint="Shown on the Terms step of the booking flow, immediately before a traveller reserves."
          >
            <Textarea
              id="statutory_notice"
              name="statutory_notice"
              rows={3}
              defaultValue={settings.statutoryNotice ?? ''}
              placeholder="Empiria World Inc. is registered under the Travel Industry Act, 2002 (Ontario)…"
            />
          </Field>
        </div>
      </Card>

      <Card title="How travellers reach you">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact email" htmlFor="contact_email" required>
            <Input id="contact_email" name="contact_email" type="email" defaultValue={settings.contactEmail ?? ''} />
          </Field>
          <Field label="Contact phone" htmlFor="contact_phone">
            <Input id="contact_phone" name="contact_phone" type="tel" defaultValue={settings.contactPhone ?? ''} />
          </Field>
          <Field label="Address" htmlFor="address_line1" className="sm:col-span-2">
            <Input id="address_line1" name="address_line1" defaultValue={addr.line1 ?? ''} placeholder="Street address" />
          </Field>
          <Field label="Line 2" htmlFor="address_line2">
            <Input id="address_line2" name="address_line2" defaultValue={addr.line2 ?? ''} />
          </Field>
          <Field label="City" htmlFor="address_city">
            <Input id="address_city" name="address_city" defaultValue={addr.city ?? ''} />
          </Field>
          <Field label="Province or state" htmlFor="address_region">
            <Input id="address_region" name="address_region" defaultValue={addr.region ?? ''} />
          </Field>
          <Field label="Postal code" htmlFor="address_postal">
            <Input id="address_postal" name="address_postal" defaultValue={addr.postal_code ?? ''} />
          </Field>
          <Field label="Country" htmlFor="address_country">
            <Input id="address_country" name="address_country" defaultValue={addr.country ?? ''} placeholder="Canada" />
          </Field>
        </div>
      </Card>

      <Card
        title="Taxes and fees"
        description="Applied to every quote and itemised separately, which is what Part D means by an all-in price with components visible. Percentages are charged on the discounted subtotal plus any fees."
      >
        {rules.length === 0 && (
          <p className="mb-4 rounded-md bg-secondary p-3 text-[13px] leading-relaxed text-muted-foreground">
            No rules yet, so every quote is currently tax-free. If Empiria charges HST, add it here.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {rules.map((rule, i) => (
            <TaxRuleFields
              key={rule._id}
              rule={rule}
              onChange={(patch) =>
                setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
              }
              onRemove={() => setRules((rs) => rs.filter((_, j) => j !== i))}
              disabled={!canEdit}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="mt-4"
          disabled={!canEdit}
          onClick={() =>
            setRules((rs) => [...rs, { _id: nextRowId++, label: '', kind: 'tax', basis: 'percent', value: 0 }])
          }
        >
          <Plus size={14} aria-hidden="true" />
          Add a tax or fee
        </Button>
      </Card>

      <Card
        title="Documents"
        description="The wording around the facts on a receipt. The facts themselves — prices, payments, what was agreed to — are the booking's and cannot be edited; legal wording goes through a disclosure block placed on the receipt."
      >
        <div className="grid gap-4">
          <Field label="Title" htmlFor="receipt_title" hint="The word in the masthead. Blank renders “Receipt”.">
            <Input id="receipt_title" name="receipt_title" maxLength={40} defaultValue={settings.receiptTitle ?? ''} placeholder="Receipt" disabled={!canEdit} />
          </Field>
          <Field label="Under the masthead" htmlFor="receipt_intro" hint="A line or two: a thank-you, or where to write with a question.">
            <Textarea id="receipt_intro" name="receipt_intro" rows={2} maxLength={400} defaultValue={settings.receiptIntro ?? ''} disabled={!canEdit} />
          </Field>
          <Field label="Closing note" htmlFor="receipt_footer" hint="Above the statutory notice: how to pay a balance, what to bring, who to call.">
            <Textarea id="receipt_footer" name="receipt_footer" rows={3} maxLength={1000} defaultValue={settings.receiptFooter ?? ''} disabled={!canEdit} />
          </Field>
        </div>
      </Card>

      <Card
        title="Currency and timing"
        description="The hold window is how long a traveller's seats survive while they fill in the booking form. The payment window is how long they survive after the booking exists."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Default currency" htmlFor="default_currency">
            <Select id="default_currency" name="default_currency" defaultValue={settings.defaultCurrency}>
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </Field>
          {/* Migration 0021: what a partner pays to put their own words on one
              of the landing page's four postcards. Zero means no rate is
              published, so nothing can be quoted — which the Promotions queue
              says out loud rather than offering to approve a free placement. */}
          <Field
            label="Postcard rate (per week)"
            htmlFor="showcase_rate_cents_per_week"
            hint="What a partner pays to promote on the landing page. A card may override it. Zero means not for sale."
          >
            <Input
              id="showcase_rate_cents_per_week"
              name="showcase_rate_cents_per_week"
              inputMode="decimal"
              defaultValue={(settings.showcaseRateCentsPerWeek / 100).toFixed(2)}
            />
          </Field>
          <Field
            label="Promoted-card wording"
            htmlFor="showcase_promoted_label"
            hint="Shown on a card a partner has paid for, if disclosure is required. Empiria decides the wording; blank shows nothing."
            className="sm:col-span-2"
          >
            <Input
              id="showcase_promoted_label"
              name="showcase_promoted_label"
              placeholder="e.g. Promoted"
              defaultValue={settings.showcasePromotedLabel ?? ''}
            />
          </Field>
          <Field
            label="Hold window (minutes)"
            htmlFor="hold_minutes"
            error={fieldError('hold_minutes')}
          >
            <Input
              id="hold_minutes"
              name="hold_minutes"
              type="number"
              min={1}
              defaultValue={settings.holdMinutes}
              error={Boolean(fieldError('hold_minutes'))}
            />
          </Field>
          <Field
            label="Payment window (minutes)"
            htmlFor="payment_window_minutes"
            error={fieldError('payment_window_minutes')}
          >
            <Input
              id="payment_window_minutes"
              name="payment_window_minutes"
              type="number"
              min={1}
              defaultValue={settings.paymentWindowMinutes}
              error={Boolean(fieldError('payment_window_minutes'))}
            />
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] text-muted-foreground">
          {settings.updatedAt
            ? `Last saved ${new Date(settings.updatedAt).toLocaleString('en-CA')}`
            : 'Never saved.'}
        </p>
        {canEdit ? (
          <SubmitButton>Save settings</SubmitButton>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Your role cannot change platform settings.
          </p>
        )}
      </div>
    </form>
  );
}

function TaxRuleFields({
  rule,
  onChange,
  onRemove,
  disabled,
}: {
  rule: TaxRuleRow & { _id: number };
  onChange: (patch: Partial<TaxRuleRow>) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const isPercent = rule.basis === 'percent';
  // Percentages are stored as points, everything else as cents — so the value
  // shown has to change units when the basis does.
  const shownValue = isPercent ? String(rule.value) : (rule.value / 100).toFixed(2);

  return (
    <div className="grid items-end gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
      <Field label="Label" htmlFor={`tax_label_${rule._id}`}>
        <Input
          id={`tax_label_${rule._id}`}
          name="tax_label"
          value={rule.label}
          disabled={disabled}
          placeholder="HST"
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </Field>
      <Field label="Type" htmlFor={`tax_kind_${rule._id}`}>
        <Select
          id={`tax_kind_${rule._id}`}
          name="tax_kind"
          value={rule.kind}
          disabled={disabled}
          onChange={(e) => onChange({ kind: e.target.value as TaxRuleRow['kind'] })}
        >
          <option value="tax">Tax</option>
          <option value="fee">Fee</option>
        </Select>
      </Field>
      <Field label="Charged" htmlFor={`tax_basis_${rule._id}`}>
        <Select
          id={`tax_basis_${rule._id}`}
          name="tax_basis"
          value={rule.basis}
          disabled={disabled}
          onChange={(e) => {
            const basis = e.target.value as TaxRuleRow['basis'];
            // Reset the number rather than reinterpret it: 13 percent becoming
            // thirteen cents is the kind of silent conversion nobody notices.
            onChange({ basis, value: 0 });
          }}
        >
          <option value="percent">As a percentage</option>
          <option value="per_booking">Once per booking</option>
          <option value="per_person">Per person</option>
        </Select>
      </Field>
      <Field label={isPercent ? 'Percent' : 'Amount'} htmlFor={`tax_value_${rule._id}`}>
        <Input
          id={`tax_value_${rule._id}`}
          name="tax_value"
          type="number"
          step={isPercent ? '0.01' : '0.01'}
          min={0}
          max={isPercent ? 100 : undefined}
          value={shownValue}
          disabled={disabled}
          className="w-28"
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ value: isPercent ? n : Math.round(n * 100) });
          }}
        />
      </Field>
      <Button
        type="button"
        variant="ghost"
        aria-label={`Remove ${rule.label || 'this rule'}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 size={15} aria-hidden="true" />
      </Button>
    </div>
  );
}
