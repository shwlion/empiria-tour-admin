'use client';

import { useActionState } from 'react';
import { Banner, Checkbox, Field, Input, SubmitButton } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { CustomerRow } from '@/lib/admin/customers';
import { saveCustomerAction } from './actions';

export default function CustomerForm({
  customer,
  address,
}: {
  customer: CustomerRow;
  address: Record<string, string>;
}) {
  const bound = saveCustomerAction.bind(null, customer.userId ?? '');
  const [state, formAction] = useActionState<ActionResult | null, FormData>(bound, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="full_name">
          <Input id="full_name" name="full_name" defaultValue={customer.name ?? ''} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={customer.phone ?? ''} />
        </Field>
        <Field label="Email" htmlFor="email" hint="The sign-in address. Changing it is an authentication event, so it is not edited here." className="sm:col-span-2">
          <Input id="email" value={customer.email ?? ''} readOnly disabled />
        </Field>
        <Field label="Address" htmlFor="line1" className="sm:col-span-2">
          <Input id="line1" name="line1" defaultValue={address.line1 ?? ''} placeholder="Street address" />
        </Field>
        <Field label="Line 2" htmlFor="line2">
          <Input id="line2" name="line2" defaultValue={address.line2 ?? ''} />
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" defaultValue={address.city ?? ''} />
        </Field>
        <Field label="Province or state" htmlFor="region">
          <Input id="region" name="region" defaultValue={address.region ?? ''} />
        </Field>
        <Field label="Postal code" htmlFor="postcode">
          <Input id="postcode" name="postcode" defaultValue={address.postcode ?? ''} />
        </Field>
        <Field label="Country" htmlFor="country">
          <Input id="country" name="country" defaultValue={address.country ?? ''} />
        </Field>
      </div>

      <Checkbox
        id="marketing_opt_in"
        name="marketing_opt_in"
        defaultChecked={customer.marketingOptIn}
        label="Accepts marketing email"
        hint="Their own choice on the storefront. Change it here only when they have asked you to."
      />

      <div>
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </form>
  );
}
