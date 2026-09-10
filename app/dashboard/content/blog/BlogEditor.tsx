'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ImagePlus, Loader2 } from 'lucide-react';
import {
  Banner, Button, Card, Field, Input, PageHeader, Select, SubmitButton, Textarea,
} from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { AdminBlogPost } from '@/lib/admin/blog';
import { renderBlogMarkdown } from '@/lib/blogMarkdown';
import { saveBlogPostAction, uploadBlogImageAction } from './actions';

/**
 * Writing a post.
 *
 * The preview runs the storefront's own renderer, so what an author sees here
 * is what a reader gets — including the refusals. A `javascript:` link showing
 * up as plain grey text in the preview is the fastest way to learn that the
 * body is a safe subset and not HTML.
 */

type Options = {
  packages: { id: string; title: string }[];
  destinations: { id: string; name: string }[];
};

export default function BlogEditor({
  post,
  options,
}: {
  post: AdminBlogPost | null;
  options: Options;
}) {
  const router = useRouter();
  const [body, setBody] = useState(post?.body ?? '');
  const [heroImage, setHeroImage] = useState(post?.heroImage ?? '');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const [state, formAction] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    async (prev, form) => {
      const result = await saveBlogPostAction(post?.id ?? null, prev, form);
      // A new post has an id only after the first save; go to its own URL so a
      // second save updates rather than creating a duplicate.
      if (result.ok && !post && result.data?.id) {
        router.replace(`/dashboard/content/blog/${result.data.id}`);
      }
      return result;
    },
    null
  );

  const upload = (file: File) =>
    startUpload(async () => {
      setUploadError(null);
      const form = new FormData();
      form.set('file', file);
      const result = await uploadBlogImageAction(null, form);
      if (!result.ok) {
        setUploadError(result.message);
        return;
      }
      const url = result.data?.url;
      if (!url) return;
      // First upload becomes the hero; later ones go into the body where the
      // cursor was last, which for a plain textarea means the end.
      if (!heroImage) setHeroImage(url);
      else setBody((b) => `${b}${b.endsWith('\n') || !b ? '' : '\n\n'}![](${url})\n`);
    });

  return (
    <>
      <PageHeader
        title={post ? 'Edit post' : 'New post'}
        description={
          post?.unpublishReason
            ? undefined
            : 'The body is a safe Markdown subset — headings, bold, italic, lists, quotes, links and uploaded pictures. Anything else is shown as text.'
        }
        actions={
          <Link href="/dashboard/content/blog">
            <Button variant="ghost">Back to posts</Button>
          </Link>
        }
      />

      {post?.unpublishReason && (
        <div className="mb-4">
          <Banner tone="error">
            An administrator took this post down: {post.unpublishReason}
          </Banner>
        </div>
      )}

      {state && (
        <div className="mb-4">
          <Banner tone={state.ok ? 'success' : 'error'}>
            {state.ok ? (state.message ?? 'Saved.') : state.message}
          </Banner>
        </div>
      )}

      <form action={formAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-5">
          <Card>
            <div className="flex flex-col gap-4">
              <Field
                label="Title"
                htmlFor="title"
                required
                error={state && !state.ok ? state.fields?.title : undefined}
                hint={
                  post?.publishedAt
                    ? `The web address is fixed at /blog/${post.slug} — it was set when the post first went live, and changing it would break every link to it.`
                    : 'The web address is made from this, and freezes when the post first publishes.'
                }
              >
                <Input id="title" name="title" defaultValue={post?.title ?? ''} required maxLength={140} />
              </Field>

              <Field
                label="Body"
                htmlFor="body"
                required
                error={state && !state.ok ? state.fields?.body : undefined}
              >
                <Textarea
                  id="body"
                  name="body"
                  rows={18}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={'## A heading\n\nA paragraph with **bold** and a [link](/tours).\n\n- a list item'}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-[13px] font-semibold text-foreground">Preview</h2>
            <div className="blog-preview rounded-md border border-border bg-background px-4 py-3">
              {body.trim() ? (
                renderBlogMarkdown(body)
              ) : (
                <p className="text-[13px] text-muted-foreground">Nothing to preview yet.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <div className="flex flex-col gap-4">
              <Field
                label="Picture"
                htmlFor="hero_image"
                hint="JPEG, PNG or WebP, up to 5 MB. Uploaded to Empiria's own storage — a link to somewhere else will not render."
              >
                <input type="hidden" name="hero_image" value={heroImage} />
                <input
                  ref={fileInput}
                  id="hero_image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(file);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  {uploading ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <ImagePlus size={14} aria-hidden="true" />
                  )}
                  {heroImage ? 'Add another picture' : 'Upload a picture'}
                </Button>
              </Field>

              {uploadError && <Banner tone="error">{uploadError}</Banner>}

              {heroImage && (
                <div className="flex flex-col gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroImage}
                    alt=""
                    className="w-full rounded-md border border-border object-cover"
                  />
                  <Button type="button" variant="ghost" onClick={() => setHeroImage('')}>
                    Remove the lead picture
                  </Button>
                </div>
              )}

              <Field label="Summary" htmlFor="excerpt" hint="Optional. Left empty, the start of the post is used.">
                <Textarea id="excerpt" name="excerpt" rows={3} defaultValue={post?.excerpt ?? ''} maxLength={300} />
              </Field>

              <Field label="About this tour" htmlFor="package_id" hint="Optional. Shows the tour's card at the end of the post.">
                <Select id="package_id" name="package_id" defaultValue={post?.packageId ?? ''}>
                  <option value="">No tour</option>
                  {options.packages.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Destination" htmlFor="destination_id" hint="Optional. Adds a link to more trips there.">
                <Select id="destination_id" name="destination_id" defaultValue={post?.destinationId ?? ''}>
                  <option value="">No destination</option>
                  {options.destinations.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <SubmitButton>{post ? 'Save changes' : 'Save as draft'}</SubmitButton>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Saving never publishes. Publishing is a separate step on the posts list.
            </p>
          </Card>
        </div>
      </form>
    </>
  );
}
