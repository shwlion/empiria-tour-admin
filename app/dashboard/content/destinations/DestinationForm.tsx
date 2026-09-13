'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Card, Field, Input, Select, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import { DESTINATION_STATUSES, type DestinationRow } from '@/lib/admin/destinations';
import { saveDestinationAction } from './actions';

export default function DestinationForm({
  destination,
  all,
}: {
  destination: DestinationRow | null;
  /** Every destination, in tree order, for the parent picker. */
  all: DestinationRow[];
}) {
  const router = useRouter();
  const bound = saveDestinationAction.bind(null, destination?.id ?? null);
  const [state, formAction] = useActionState<ActionResult<{ id: string }> | null, FormData>(bound, null);
  const err = (k: string) => (state && !state.ok ? state.fields?.[k] : undefined);

  // A new destination lands on its own page once it exists.
  useEffect(() => {
    if (state?.ok && state.data?.id && !destination) router.push(`/dashboard/content/destinations/${state.data.id}`);
  }, [state, destination, router]);

  // A place cannot be its own parent, or inside one of its own places.
  const parents = all.filter((d) => !destination || (d.id !== destination.id && !d.path.startsWith(`${destination.path}/`)));

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      <Card title="The place" description="Name and where it sits. The web address becomes part of every place inside it — renaming carries them along.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required error={err('name')}>
            <Input id="name" name="name" defaultValue={destination?.name ?? ''} required placeholder="Santorini" />
          </Field>
          <Field label="Web address" htmlFor="slug" hint="Lowercase, hyphens. Left blank it is made from the name." error={err('slug')}>
            <Input id="slug" name="slug" defaultValue={destination?.slug ?? ''} placeholder="santorini" />
          </Field>
          <Field label="Inside" htmlFor="parent_id" hint="Leave empty for a country or a top-level region." error={err('parent_id')}>
            <Select id="parent_id" name="parent_id" defaultValue={destination?.parentId ?? ''}>
              <option value="">— top level —</option>
              {parents.map((d) => (
                <option key={d.id} value={d.id}>
                  {'  '.repeat(d.depth)}{d.name}{d.status !== 'published' ? ` (${d.status})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="status" hint="Only published places appear in the menu and filters." error={err('status')}>
            <Select id="status" name="status" defaultValue={destination?.status ?? 'draft'}>
              {DESTINATION_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Order" htmlFor="sort_order" hint="Lower comes first among its siblings.">
            <Input id="sort_order" name="sort_order" type="number" defaultValue={destination?.sortOrder ?? 0} />
          </Field>
        </div>
      </Card>

      <Card title="On the page" description="Shown on the catalogue when a visitor filters to this place.">
        <div className="grid gap-4">
          <Field label="Description" htmlFor="description">
            <Textarea id="description" name="description" rows={4} defaultValue={destination?.description ?? ''} />
          </Field>
          <Field label="Hero image" htmlFor="hero_image" hint="An https address (Supabase storage), or a path on the storefront." error={err('hero_image')}>
            <Input id="hero_image" name="hero_image" defaultValue={destination?.heroImage ?? ''} placeholder="https://…" />
          </Field>
        </div>
      </Card>

      <Card title="Search engines" description="What Google shows. Left blank, the name and description are used.">
        <div className="grid gap-4">
          <Field label="Meta title" htmlFor="meta_title">
            <Input id="meta_title" name="meta_title" maxLength={70} defaultValue={destination?.metaTitle ?? ''} />
          </Field>
          <Field label="Meta description" htmlFor="meta_description">
            <Textarea id="meta_description" name="meta_description" rows={2} maxLength={160} defaultValue={destination?.metaDescription ?? ''} />
          </Field>
        </div>
      </Card>

      <div>
        <SubmitButton>{destination ? 'Save changes' : 'Create destination'}</SubmitButton>
      </div>
    </form>
  );
}
