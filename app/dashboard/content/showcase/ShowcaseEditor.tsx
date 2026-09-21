'use client';

import { useActionState, useState, useTransition } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Banner, Button, Card, Checkbox, Field, Input, Select, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import { SHOWCASE_LIMITS as LIMITS, SHOWCASE_SLOTS, type ShowcaseCardRecord } from '@/lib/admin/content';
import {
  deleteShowcaseCardAction,
  moveShowcaseCardAction,
  saveShowcaseCardAction,
  setShowcaseStatusAction,
} from './actions';
import { STOREFRONT_URL } from '@/lib/storefront';

/**
 * The four postcards on the landing page.
 *
 * Illustrative, not inventory — migration 0012 gives them no dates, seats or
 * prices, so nothing here can disagree with a departure. What Empiria is
 * choosing is a photograph, a mood line and a sentence, which is why the form
 * carries a live preview: the card is the product, and a title that is fine
 * in a text box can be two lines too long over a photograph.
 */

/**
 * Where a bare path points. The seed rows use `/showcase/….jpg` from the
 * storefront's public folder, which the console does not serve — so previews
 * resolve them against the storefront, the same host the tour pages link to.
 */
const STOREFRONT = STOREFRONT_URL;

/** Only sources a browser can load; anything half-typed shows the placeholder instead. */
function previewSrc(url: string): string | null {
  if (url.startsWith('/')) return url.startsWith('//') ? null : `${STOREFRONT}${url}`;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

type Notice = { ok: boolean; text: string };

export default function ShowcaseEditor({ cards }: { cards: ShowcaseCardRecord[] }) {
  const [editing, setEditing] = useState<ShowcaseCardRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, startTransition] = useTransition();

  if (editing || creating) {
    return (
      <CardForm
        card={editing}
        onDone={(message) => {
          setEditing(null);
          setCreating(false);
          setNotice(message ? { ok: true, text: message } : null);
        }}
      />
    );
  }

  const published = cards.filter((c) => c.status === 'published').length;

  function run(action: () => Promise<ActionResult>) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      setNotice({ ok: result.ok, text: result.ok ? (result.message ?? 'Done.') : result.message });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Shown in this order. The landing page takes the first {SHOWCASE_SLOTS} that are published.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus size={14} aria-hidden="true" />
          New postcard
        </Button>
      </div>

      {published !== SHOWCASE_SLOTS && (
        <Banner tone={published === 0 ? 'error' : 'info'}>
          The landing page shows {SHOWCASE_SLOTS} postcards; {published} {published === 1 ? 'is' : 'are'} published.
          {published > SHOWCASE_SLOTS && ' The ones past the fourth are never seen.'}
        </Banner>
      )}

      {notice && <Banner tone={notice.ok ? 'success' : 'error'}>{notice.text}</Banner>}

      {cards.length === 0 && (
        <Banner tone="error">No postcards at all. The landing page hero has nothing to show.</Banner>
      )}

      <div className="flex flex-col gap-3">
        {cards.map((card, i) => {
          const src = previewSrc(card.imageUrl);
          const live = card.status === 'published';
          return (
            <div key={card.id} className="flex gap-4 rounded-lg border border-border bg-card p-4">
              <div className="relative h-[72px] w-[108px] shrink-0 overflow-hidden rounded-md bg-black/8">
                {src && (
                  <Image src={src} alt={card.imageAlt} fill unoptimized sizes="108px" className="object-cover" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-foreground">{card.title}</span>
                  <Badge value={card.status} />
                  {card.kicker && (
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {card.kicker}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                  {card.description}
                </p>
                <p className="mt-1 font-mono text-[12px] text-muted-foreground">{card.linkUrl}</p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="ghost"
                    disabled={pending || i === 0}
                    aria-label={`Move ${card.title} up`}
                    onClick={() => run(() => moveShowcaseCardAction(card.id, 'up'))}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                    Up
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending || i === cards.length - 1}
                    aria-label={`Move ${card.title} down`}
                    onClick={() => run(() => moveShowcaseCardAction(card.id, 'down'))}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                    Down
                  </Button>
                  {live ? (
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => run(() => setShowcaseStatusAction(card.id, 'draft'))}
                    >
                      <EyeOff size={14} aria-hidden="true" />
                      Unpublish
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      disabled={pending}
                      onClick={() => run(() => setShowcaseStatusAction(card.id, 'published'))}
                    >
                      <Eye size={14} aria-hidden="true" />
                      Publish
                    </Button>
                  )}
                  <Button variant="secondary" disabled={pending} onClick={() => setEditing(card)}>
                    <Pencil size={14} aria-hidden="true" />
                    Edit
                  </Button>
                  {live ? (
                    <span className="ml-1 text-[12px] text-muted-foreground">Unpublish before deleting.</span>
                  ) : (
                    <Button
                      variant="danger"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(`Delete “${card.title}”? There is no undo.`)) return;
                        run(() => deleteShowcaseCardAction(card.id));
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Delete
                    </Button>
                  )}
                  {pending && <Loader2 size={14} className="animate-spin text-muted-foreground" aria-hidden="true" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardForm({ card, onDone }: { card: ShowcaseCardRecord | null; onDone: (message?: string) => void }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    async (prev, form) => {
      const result = await saveShowcaseCardAction(card?.id ?? null, prev, form);
      // A create form left open after saving would create again on the next
      // submit, so a new card goes straight back to the list. Edits stay put.
      if (result.ok && !card) onDone(result.message);
      return result;
    },
    null
  );
  const err = (k: string) => (state && !state.ok ? state.fields?.[k] : undefined);

  // Controlled so the preview follows every keystroke.
  const [title, setTitle] = useState(card?.title ?? '');
  const [kicker, setKicker] = useState(card?.kicker ?? '');
  const [description, setDescription] = useState(card?.description ?? '');
  const [imageUrl, setImageUrl] = useState(card?.imageUrl ?? '');
  const [imageAlt, setImageAlt] = useState(card?.imageAlt ?? '');
  const src = previewSrc(imageUrl.trim());

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      <button
        type="button"
        onClick={() => onDone()}
        className="self-start text-[12px] font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        ← All postcards
      </button>

      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      <Card
        title={card ? 'Edit postcard' : 'New postcard'}
        description="What a trip could be — not a tour. No dates, seats or prices; those live on the tour and would go stale here."
      >
        <div className="grid gap-4">
          <Field
            label="Title"
            htmlFor="title"
            required
            error={err('title')}
            hint={`Shown large over the photograph. ${title.length}/${LIMITS.title}`}
          >
            <Input
              id="title"
              name="title"
              maxLength={LIMITS.title}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Cyclades by sail"
              error={Boolean(err('title'))}
            />
          </Field>

          <Field
            label="Kicker"
            htmlFor="kicker"
            error={err('kicker')}
            hint={`A mood line, e.g. Islands · Slow travel — never a date or a price. ${kicker.length}/${LIMITS.kicker}`}
          >
            <Input
              id="kicker"
              name="kicker"
              maxLength={LIMITS.kicker}
              value={kicker}
              onChange={(e) => setKicker(e.target.value)}
              placeholder="Islands · Slow travel"
              error={Boolean(err('kicker'))}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            required
            error={err('description')}
            hint={`One sentence. ${description.length}/${LIMITS.description}`}
          >
            <Textarea
              id="description"
              name="description"
              rows={2}
              maxLength={LIMITS.description}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Island hopping the quiet way. Small coves, local tavernas, clear water."
              error={Boolean(err('description'))}
            />
          </Field>

          <Field
            label="Photograph"
            htmlFor="image_url"
            required
            error={err('image_url')}
            hint="Full URL. Paste the public address of a file in Supabase storage — there is no upload here yet."
          >
            <Input
              id="image_url"
              name="image_url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              error={Boolean(err('image_url'))}
            />
          </Field>

          <Field
            label="Photograph description"
            htmlFor="image_alt"
            error={err('image_alt')}
            hint="What the photo shows, for screen readers — “Whitewashed houses above the Aegean”."
          >
            <Input
              id="image_alt"
              name="image_alt"
              value={imageAlt}
              onChange={(e) => setImageAlt(e.target.value)}
              error={Boolean(err('image_alt'))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Goes to"
              htmlFor="link_url"
              error={err('link_url')}
              hint="A path on the storefront, e.g. /tours?destination=greece"
            >
              <Input
                id="link_url"
                name="link_url"
                defaultValue={card?.linkUrl ?? '/tours'}
                placeholder="/tours"
                error={Boolean(err('link_url'))}
              />
            </Field>
            <Field label="Status" htmlFor="status">
              <Select id="status" name="status" defaultValue={card?.status ?? 'draft'}>
                <option value="draft">Draft — kept here, not shown</option>
                <option value="published">Published — on the landing page</option>
              </Select>
            </Field>

            {/* Migration 0021. A slot a partner can buy for a run of days:
                their photograph and words stand in this card's place for the
                window they paid for, and it falls back to this one outside it.
                Off by default — putting Empiria's own card on the market is a
                deliberate act, not something a new column does quietly. */}
            <div className="rounded-lg border border-border bg-background p-3">
              <Checkbox
                id="sellable"
                name="sellable"
                defaultChecked={card?.sellable ?? false}
                label="Partners may buy this slot"
                hint="Requests appear under Content → Promotions, where you set the price and approve."
              />
              <div className="mt-3">
                <Field
                  label="Rate for this card"
                  htmlFor="rate_cents_per_week"
                  hint="Per week. Leave empty to use the platform rate in Settings."
                  error={err('rate_cents_per_week')}
                >
                  <Input
                    id="rate_cents_per_week"
                    name="rate_cents_per_week"
                    inputMode="decimal"
                    placeholder="Platform rate"
                    defaultValue={card?.rateCentsPerWeek != null ? (card.rateCentsPerWeek / 100).toFixed(2) : ''}
                    error={Boolean(err('rate_cents_per_week'))}
                  />
                </Field>
              </div>
              {err('sellable') && (
                <p className="mt-2 text-[12px] font-medium text-destructive">{err('sellable')}</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Preview" description="Roughly how it sits in the hero deck. The storefront's type is larger; if it is tight here, it is tight there.">
        <div className="relative aspect-[3/2] w-full max-w-sm overflow-hidden rounded-lg bg-neutral-800">
          {src ? (
            <Image src={src} alt={imageAlt} fill unoptimized sizes="384px" className="object-cover" />
          ) : (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] text-white/60">
              Paste a photograph address to see it here.
            </p>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 p-5">
            {kicker && (
              <p className="text-[11px] font-semibold uppercase tracking-widest text-white/80">{kicker}</p>
            )}
            <p className="mt-1 text-[22px] font-bold leading-tight tracking-tight text-white">
              {title || 'Untitled postcard'}
            </p>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <SubmitButton>{card ? 'Save postcard' : 'Create postcard'}</SubmitButton>
      </div>
    </form>
  );
}
