'use client';

import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { ExternalLink, Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge, Banner, Button, Card, EmptyState, Field, PageHeader, SubmitButton, Textarea,
} from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { AdminBlogPost, BlogStatus } from '@/lib/admin/blog';
import { STOREFRONT_URL } from '@/lib/storefront';
import { deleteBlogPostAction, publishBlogPostAction, unpublishBlogPostAction } from './actions';

/**
 * Every post by every author, newest movement first.
 *
 * Unpublish is the primary action and delete is not. A post that was false or
 * defamatory is a record Empiria may need after it is gone, and a takedown is
 * reversible where a delete is not — so the destructive one is the quiet
 * option, behind a confirmation, and it says what it will take with it.
 */

const FILTERS: { key: BlogStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Live' },
  { key: 'draft', label: 'Drafts' },
  { key: 'unpublished', label: 'Taken down' },
];

type Notice = { ok: boolean; text: string };

export default function BlogModeration({
  posts,
  counts,
  active,
}: {
  posts: AdminBlogPost[];
  counts: Record<BlogStatus | 'all', number>;
  active: BlogStatus | 'all';
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [takingDown, setTakingDown] = useState<AdminBlogPost | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await fn();
      setNotice({ ok: result.ok, text: result.ok ? (result.message ?? 'Done.') : result.message });
    });

  return (
    <>
      <PageHeader
        title="Blog"
        description="Posts by Empiria and by partners. Partners publish without review, so this list is sorted by what moved most recently — a new post is the first thing you see."
        actions={
          <Link href="/dashboard/content/blog/new">
            <Button>
              <Plus size={14} aria-hidden="true" />
              New post
            </Button>
          </Link>
        }
      />

      {notice && (
        <div className="mb-4">
          <Banner tone={notice.ok ? 'success' : 'error'}>{notice.text}</Banner>
        </div>
      )}

      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === 'all' ? '/dashboard/content/blog' : `/dashboard/content/blog?status=${f.key}`}
            aria-current={active === f.key ? 'page' : undefined}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              active === f.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
            }`}
          >
            {f.label} · {counts[f.key]}
          </Link>
        ))}
      </nav>

      {takingDown && (
        <TakedownDialog
          post={takingDown}
          onDone={(message) => {
            setTakingDown(null);
            if (message) setNotice({ ok: true, text: message });
          }}
        />
      )}

      {posts.length === 0 ? (
        <EmptyState
          title="Nothing here"
          description={
            active === 'all'
              ? 'No posts have been written yet.'
              : 'No posts with that status.'
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-foreground">{post.title}</h2>
                    <Badge value={post.status} />
                  </div>

                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {post.authorName}
                    <span className="text-muted-foreground/60"> · {post.authorRole}</span>
                    <span className="text-muted-foreground/60">
                      {' '}· updated {new Date(post.updatedAt).toLocaleString('en-CA')}
                    </span>
                  </p>

                  {post.unpublishReason && (
                    // The trail survives the takedown, and reading it should not
                    // require opening the post.
                    <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-relaxed text-destructive">
                      Taken down
                      {post.unpublishedAt && ` on ${new Date(post.unpublishedAt).toLocaleDateString('en-CA')}`}
                      : {post.unpublishReason}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {post.status === 'published' && (
                    <a
                      href={`${STOREFRONT_URL}/blog/${post.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost">
                        <ExternalLink size={14} aria-hidden="true" />
                        View
                      </Button>
                    </a>
                  )}

                  <Link href={`/dashboard/content/blog/${post.id}`}>
                    <Button variant="secondary">
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </Button>
                  </Link>

                  {post.status === 'published' ? (
                    <Button variant="secondary" disabled={pending} onClick={() => setTakingDown(post)}>
                      <EyeOff size={14} aria-hidden="true" />
                      Take down
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => run(() => publishBlogPostAction(post.id))}
                    >
                      {pending ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Eye size={14} aria-hidden="true" />
                      )}
                      Publish
                    </Button>
                  )}

                  <Button
                    variant="danger"
                    disabled={pending}
                    onClick={() => {
                      if (
                        !confirm(
                          `Delete “${post.title}” permanently?\n\nThis cannot be undone and removes the pictures uploaded with it. If you only want it off the site, take it down instead — that is reversible and keeps the record.`
                        )
                      ) {
                        return;
                      }
                      run(() => deleteBlogPostAction(post.id));
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/** A takedown needs a reason: the author sees it, and so does the audit trail. */
function TakedownDialog({
  post,
  onDone,
}: {
  post: AdminBlogPost;
  onDone: (message?: string) => void;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    async (prev, form) => {
      const result = await unpublishBlogPostAction(post.id, prev, form);
      if (result.ok) onDone(result.message ?? 'Taken down.');
      return result;
    },
    null
  );

  return (
    <div className="mb-5">
      <Card>
        <h2 className="text-[15px] font-semibold text-foreground">Take down “{post.title}”</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          It comes off the site at once. The author will see this reason in their editor and
          cannot publish it again — only an administrator can.
        </p>

        {state && !state.ok && (
          <div className="mt-3">
            <Banner tone="error">{state.message}</Banner>
          </div>
        )}

        <form action={formAction} className="mt-4 flex flex-col gap-3">
          <Field label="Reason" htmlFor="reason" error={state && !state.ok ? state.fields?.reason : undefined}>
            <Textarea
              id="reason"
              name="reason"
              rows={3}
              required
              placeholder="What is wrong with it, in a sentence the author can act on."
            />
          </Field>
          <div className="flex items-center gap-2">
            <SubmitButton variant="danger">Take it down</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => onDone()}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
