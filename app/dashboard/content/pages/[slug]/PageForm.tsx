'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Banner, Card, Field, Input, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { StaticPage } from '@/lib/admin/content';
import { saveStaticPageAction } from '../../actions';

export default function PageForm({
  slug,
  page,
  route,
  why,
  fallbackTitle,
}: {
  slug: string;
  page: StaticPage | null;
  route: string | null;
  why: string | null;
  fallbackTitle: string;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveStaticPageAction.bind(null, slug),
    null
  );
  const err = (k: string) => (state && !state.ok ? state.fields?.[k] : undefined);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      <Link
        href="/dashboard/content/pages"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        All pages
      </Link>

      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      {!page && (
        <Banner tone="error">
          This page has no row yet, so <code className="rounded bg-black/5 px-1">{route}</code> is
          currently returning &ldquo;not found&rdquo; to anyone who follows the footer link. Saving
          creates it.
        </Banner>
      )}

      <Card
        title={page?.title ?? fallbackTitle}
        description={why ?? 'This page exists in the database but has no route on the storefront.'}
      >
        <div className="grid gap-4">
          <Field
            label="Address"
            htmlFor="slug-display"
            hint="Fixed. The storefront route asks for this exact word, and the footer links to it — renaming it would take the page off the site."
          >
            <Input id="slug-display" value={route ?? `/${slug}`} readOnly disabled />
          </Field>

          <Field label="Title" htmlFor="title" required error={err('title')}>
            <Input
              id="title"
              name="title"
              defaultValue={page?.title ?? fallbackTitle}
              error={Boolean(err('title'))}
            />
          </Field>

          <Field
            label="Body"
            htmlFor="body"
            required
            error={err('body')}
            hint="Plain text. Line breaks are preserved on the page."
          >
            <Textarea
              id="body"
              name="body"
              rows={22}
              defaultValue={page?.body ?? ''}
              error={Boolean(err('body'))}
              className="font-mono text-[13px]"
            />
          </Field>
        </div>
      </Card>

      <Card title="Search listing" description="How the page appears in search results. Falls back to the title.">
        <div className="grid gap-4">
          <Field label="Page title" htmlFor="meta_title">
            <Input id="meta_title" name="meta_title" defaultValue={page?.metaTitle ?? ''} />
          </Field>
          <Field label="Description" htmlFor="meta_description">
            <Textarea id="meta_description" name="meta_description" rows={2} defaultValue={page?.metaDescription ?? ''} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] text-muted-foreground">
          {page ? `Last edited ${new Date(page.updatedAt).toLocaleString('en-CA')}` : 'Not yet created.'}
        </p>
        <SubmitButton>{page ? 'Save page' : 'Create page'}</SubmitButton>
      </div>
    </form>
  );
}
