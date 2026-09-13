'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Card, Checkbox, Field, Input, Select, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import { COLLECTION_STATUSES, type CollectionDetail, type PackageChoice } from '@/lib/admin/collections';
import { saveCollectionAction, setFeaturedAction } from './actions';

export function CollectionForm({ collection, packages }: { collection: CollectionDetail | null; packages: PackageChoice[] }) {
  const router = useRouter();
  const bound = saveCollectionAction.bind(null, collection?.id ?? null);
  const [state, formAction] = useActionState<ActionResult<{ id: string }> | null, FormData>(bound, null);
  const err = (k: string) => (state && !state.ok ? state.fields?.[k] : undefined);
  const members = new Set(collection?.members ?? []);

  useEffect(() => {
    if (state?.ok && state.data?.id && !collection) router.push(`/dashboard/content/collections/${state.data.id}`);
  }, [state, collection, router]);

  // Members first, in their order, then the rest — so the form's order is the shelf's order.
  const ordered = [
    ...(collection?.members ?? []).map((id) => packages.find((p) => p.id === id)).filter((p): p is PackageChoice => !!p),
    ...packages.filter((p) => !members.has(p.id)),
  ];

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      <Card title="The collection" description="A themed shelf of tours on the home page and the catalogue.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required error={err('name')}>
            <Input id="name" name="name" defaultValue={collection?.name ?? ''} required placeholder="Island hopping" />
          </Field>
          <Field label="Web address" htmlFor="slug" hint="Left blank it is made from the name." error={err('slug')}>
            <Input id="slug" name="slug" defaultValue={collection?.slug ?? ''} placeholder="island-hopping" />
          </Field>
          <Field label="Status" htmlFor="status" hint="Only published collections show." error={err('status')}>
            <Select id="status" name="status" defaultValue={collection?.status ?? 'draft'}>
              {COLLECTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Order" htmlFor="sort_order" hint="Lower comes first.">
            <Input id="sort_order" name="sort_order" type="number" defaultValue={collection?.sortOrder ?? 0} />
          </Field>
          <Field label="Description" htmlFor="description" className="sm:col-span-2">
            <Textarea id="description" name="description" rows={3} defaultValue={collection?.description ?? ''} />
          </Field>
          <Field label="Hero image" htmlFor="hero_image" hint="An https address, or a path on the storefront." error={err('hero_image')} className="sm:col-span-2">
            <Input id="hero_image" name="hero_image" defaultValue={collection?.heroImage ?? ''} placeholder="https://…" />
          </Field>
        </div>
      </Card>

      <Card title="Tours in it" description={packages.length === 0 ? 'No tours to choose from yet.' : 'Tick the tours that belong. Members are listed first, in their current order; a draft tour can be a member but only shows once it is published.'}>
        <div className="grid gap-2 sm:grid-cols-2">
          {ordered.map((p) => (
            <Checkbox
              key={p.id}
              id={`pkg-${p.id}`}
              name="package_id"
              value={p.id}
              defaultChecked={members.has(p.id)}
              label={p.title}
              hint={[p.destination, p.status !== 'published' ? p.status : null].filter(Boolean).join(' · ') || undefined}
            />
          ))}
        </div>
      </Card>

      <div>
        <SubmitButton>{collection ? 'Save changes' : 'Create collection'}</SubmitButton>
      </div>
    </form>
  );
}

export function FeaturedForm({ packages }: { packages: PackageChoice[] }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(setFeaturedAction, null);
  const published = packages.filter((p) => p.status === 'published');
  return (
    <form action={formAction}>
      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}
      {published.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nothing is published yet, so nothing can be featured.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {published.map((p) => (
            <Checkbox key={p.id} id={`feat-${p.id}`} name="featured" value={p.id} defaultChecked={p.isFeatured} label={p.title} hint={p.destination ?? undefined} />
          ))}
        </div>
      )}
      {published.length > 0 && (
        <div className="mt-4">
          <SubmitButton>Save featured row</SubmitButton>
        </div>
      )}
    </form>
  );
}
