'use client';

import { useActionState } from 'react';
import { Banner, Card, Checkbox, Field, Input, Select, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { PackageRecord } from '@/lib/admin/packages';
import { saveBasicsAction } from './actions';

export default function BasicsForm({
  pkg,
  destinations,
  categories,
}: {
  pkg: PackageRecord;
  destinations: { id: string; name: string; path: string; status: string }[];
  categories: { id: string; name: string; status: string }[];
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveBasicsAction.bind(null, pkg.id),
    null
  );
  const err = (k: string) => (state && !state.ok ? state.fields?.[k] : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      <Card title="What it is">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="title" required error={err('title')}>
              <Input id="title" name="title" defaultValue={pkg.title} error={Boolean(err('title'))} />
            </Field>
            <Field label="Web address" htmlFor="slug" required error={err('slug')} hint="Changing this breaks existing links.">
              <Input id="slug" name="slug" defaultValue={pkg.slug} error={Boolean(err('slug'))} />
            </Field>
          </div>

          <Field
            label="Summary"
            htmlFor="summary"
            hint="One or two sentences. This is the card text everywhere the tour is listed."
          >
            <Textarea id="summary" name="summary" rows={2} defaultValue={pkg.summary ?? ''} />
          </Field>

          <Field
            label="Overview"
            htmlFor="overview"
            hint="The long description on the tour page. Plain text or simple HTML."
          >
            <Textarea id="overview" name="overview" rows={8} defaultValue={pkg.overview ?? ''} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Destination" htmlFor="destination_id">
              <Select id="destination_id" name="destination_id" defaultValue={pkg.destinationId ?? ''}>
                <option value="">None</option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.path}
                    {d.status !== 'published' ? ' (draft)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" htmlFor="category_id">
              <Select id="category_id" name="category_id" defaultValue={pkg.categoryId ?? ''}>
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tags" htmlFor="tags" hint="Comma separated. Used for filtering." className="sm:col-span-2">
              <Input id="tags" name="tags" defaultValue={pkg.tags.join(', ')} placeholder="small group, walking, food" />
            </Field>
          </div>

          <Checkbox
            name="is_featured"
            defaultChecked={pkg.isFeatured}
            label="Feature on the home page"
            hint="Featured tours appear in the highlighted row above the catalogue."
          />
        </div>
      </Card>

      <Card title="How long">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Days" htmlFor="duration_days">
            <Input id="duration_days" name="duration_days" type="number" min={1} defaultValue={pkg.durationDays ?? ''} />
          </Field>
          <Field label="Nights" htmlFor="duration_nights">
            <Input id="duration_nights" name="duration_nights" type="number" min={0} defaultValue={pkg.durationNights ?? ''} />
          </Field>
          <Field label="Shown as" htmlFor="duration_label" hint="Free text, used on cards.">
            <Input id="duration_label" name="duration_label" defaultValue={pkg.durationLabel ?? ''} placeholder="8 days / 7 nights" />
          </Field>
        </div>
      </Card>

      <Card
        title="Images"
        description="Full URLs. There is no upload here yet — host the files somewhere and paste the addresses."
      >
        <div className="grid gap-4">
          <Field label="Hero image" htmlFor="hero_image">
            <Input id="hero_image" name="hero_image" defaultValue={pkg.heroImage ?? ''} placeholder="https://…" />
          </Field>
          <Field label="Gallery" htmlFor="gallery" hint="One address per line.">
            <Textarea id="gallery" name="gallery" rows={4} defaultValue={pkg.gallery.join('\n')} />
          </Field>
        </div>
      </Card>

      <Card title="Practical" description="Shown in the facts strip and the practical section of the tour page.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Meeting point" htmlFor="meeting_point">
            <Input id="meeting_point" name="meeting_point" defaultValue={pkg.meetingPoint ?? ''} />
          </Field>
          <Field label="Minimum age" htmlFor="minimum_age" hint="Leave blank if there is none.">
            <Input id="minimum_age" name="minimum_age" type="number" min={0} defaultValue={pkg.minimumAge ?? ''} />
          </Field>
          <Field label="Effort" htmlFor="physical_rating" hint="“Easy”, “Moderate — 5km a day on foot”.">
            <Input id="physical_rating" name="physical_rating" defaultValue={pkg.physicalRating ?? ''} />
          </Field>
          <Field label="What to bring" htmlFor="what_to_bring">
            <Textarea id="what_to_bring" name="what_to_bring" rows={3} defaultValue={pkg.whatToBring ?? ''} />
          </Field>
        </div>
      </Card>

      <Card title="Search listing" description="How the tour appears in search results. Falls back to the title and summary.">
        <div className="grid gap-4">
          <Field label="Page title" htmlFor="meta_title">
            <Input id="meta_title" name="meta_title" defaultValue={pkg.metaTitle ?? ''} />
          </Field>
          <Field label="Description" htmlFor="meta_description">
            <Textarea id="meta_description" name="meta_description" rows={2} defaultValue={pkg.metaDescription ?? ''} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <SubmitButton>Save</SubmitButton>
      </div>
    </form>
  );
}
