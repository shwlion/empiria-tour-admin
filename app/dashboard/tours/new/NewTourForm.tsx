'use client';

import { useActionState, useState } from 'react';
import { Banner, Card, Field, Input, Select, SubmitButton } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import { slugify } from '@/lib/admin/packages';
import { createPackageAction } from '../actions';
import { STOREFRONT_HOST } from '@/lib/storefront';

export default function NewTourForm({
  destinations,
  categories,
  currencies,
}: {
  destinations: { id: string; name: string; path: string; status: string }[];
  categories: { id: string; name: string; status: string }[];
  currencies: { code: string; name: string }[];
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    createPackageAction,
    null
  );
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  // The address follows the title until somebody takes it over, then stops —
  // silently rewriting a slug that has been shared is how links break.
  const effectiveSlug = slugEdited ? slug : slugify(title);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      <Card
        title="Start a tour"
        description="Just enough to create a draft. Everything else — itinerary, rooms, extras, dates — is on the editor afterwards."
      >
        <div className="grid gap-4">
          <Field label="Title" htmlFor="title" required error={state && !state.ok ? state.fields?.title : undefined}>
            <Input
              id="title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Aegean Light: Athens to Santorini"
              autoFocus
            />
          </Field>

          <Field
            label="Web address"
            htmlFor="slug"
            hint={effectiveSlug ? `${STOREFRONT_HOST}/tours/${effectiveSlug}` : 'Filled in from the title.'}
          >
            <Input
              id="slug"
              name="slug"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value);
              }}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Destination" htmlFor="destination_id" hint="It appears under nothing until this is set.">
              <Select id="destination_id" name="destination_id" defaultValue="">
                <option value="">Choose later</option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.path}
                    {d.status !== 'published' ? ' (draft)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" htmlFor="category_id">
              <Select id="category_id" name="category_id" defaultValue="">
                <option value="">Choose later</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Currency" htmlFor="currency">
              <Select id="currency" name="currency" defaultValue={currencies[0]?.code ?? 'CAD'}>
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Price per adult" htmlFor="base_price" hint="Changeable at any time before it goes live.">
              <Input id="base_price" name="base_price" type="number" step="0.01" min={0} placeholder="0.00" />
            </Field>
            <Field label="Length in days" htmlFor="duration_days">
              <Input id="duration_days" name="duration_days" type="number" min={1} placeholder="8" />
            </Field>
            <Field label="Shown as" htmlFor="duration_label" hint="Free text: “8 days / 7 nights”, “5–6 hours”.">
              <Input id="duration_label" name="duration_label" placeholder="8 days / 7 nights" />
            </Field>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <SubmitButton>Create draft</SubmitButton>
      </div>
    </form>
  );
}
