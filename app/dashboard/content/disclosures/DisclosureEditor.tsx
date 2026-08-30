'use client';

import { useActionState, useState, useTransition } from 'react';
import { Archive, Plus, ShieldCheck } from 'lucide-react';
import { Badge, Banner, Button, Card, Checkbox, Field, Input, Select, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { DisclosureBlock } from '@/lib/admin/content';
import { PLACEMENTS } from '@/lib/admin/content';
import { retireDisclosureAction, saveDisclosureAction } from '../actions';

/**
 * Part D's spine, made editable.
 *
 * Blocks are edited one at a time rather than as a list of textareas: each one
 * is a legal instrument with its own placements and its own acknowledgement
 * history, and a form that saved eight of them at once would make it very easy
 * to change something nobody meant to touch.
 */
export default function DisclosureEditor({ blocks }: { blocks: DisclosureBlock[] }) {
  const [editing, setEditing] = useState<DisclosureBlock | null>(null);
  const [creating, setCreating] = useState(false);

  if (editing || creating) {
    return (
      <BlockForm
        block={editing}
        onDone={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    );
  }

  const active = blocks.filter((b) => b.status === 'active');
  const retired = blocks.filter((b) => b.status !== 'active');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus size={14} aria-hidden="true" />
          New disclosure
        </Button>
      </div>

      {active.length === 0 && (
        <Banner tone="error">
          No active disclosures. Part D&rsquo;s engine is running and has nothing to render.
        </Banner>
      )}

      <div className="flex flex-col gap-3">
        {[...active, ...retired].map((block) => (
          <button
            key={block.id}
            type="button"
            onClick={() => setEditing(block)}
            className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-foreground">{block.name}</span>
              <Badge value={block.status} />
              {block.requiresAcknowledgement && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  <ShieldCheck size={11} aria-hidden="true" />
                  Needs a tick
                </span>
              )}
            </div>

            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
              {block.body}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              {block.placements.length === 0 ? (
                <span className="text-destructive">Appears nowhere</span>
              ) : (
                <span>
                  {block.placements
                    .map((p) => PLACEMENTS.find((x) => x.value === p)?.label ?? p)
                    .join(' · ')}
                </span>
              )}
              {block.acknowledgedCount > 0 && (
                <span>
                  · agreed to on {block.acknowledgedCount}{' '}
                  {block.acknowledgedCount === 1 ? 'booking' : 'bookings'}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockForm({ block, onDone }: { block: DisclosureBlock | null; onDone: () => void }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveDisclosureAction.bind(null, block?.id ?? null),
    null
  );
  const [pending, startTransition] = useTransition();
  const [retireError, setRetireError] = useState<string | null>(null);
  const [placements, setPlacements] = useState<string[]>(block?.placements ?? []);
  const err = (k: string) => (state && !state.ok ? state.fields?.[k] : undefined);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      <button
        type="button"
        onClick={onDone}
        className="self-start text-[12px] font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        ← All disclosures
      </button>

      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}
      {retireError && <Banner tone="error">{retireError}</Banner>}

      {block && block.acknowledgedCount > 0 && (
        <Banner tone="info">
          <p className="font-medium text-foreground">
            {block.acknowledgedCount}{' '}
            {block.acknowledgedCount === 1 ? 'traveller has' : 'travellers have'} already agreed to
            this.
          </p>
          <p className="mt-1">
            Editing the wording does not change what any of them agreed to — each booking stores the
            exact text that was on screen at the time, with a timestamp. This changes only what
            people see from now on.
          </p>
        </Banner>
      )}

      <Card title={block ? 'Edit disclosure' : 'New disclosure'}>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required error={err('name')} hint="What staff see when assigning it.">
              <Input id="name" name="name" defaultValue={block?.name ?? ''} error={Boolean(err('name'))} />
            </Field>
            <Field label="Reference" htmlFor="slug" required error={err('slug')} hint="Lowercase, for internal use.">
              <Input id="slug" name="slug" defaultValue={block?.slug ?? ''} placeholder="cancellation-ack" error={Boolean(err('slug'))} />
            </Field>
          </div>

          <Field
            label="Wording"
            htmlFor="body"
            required
            error={err('body')}
            hint="Shown to travellers exactly as written. This is Empiria's text, not ours — §2.3 warrants the mechanism, not the words."
          >
            <Textarea id="body" name="body" rows={8} defaultValue={block?.body ?? ''} error={Boolean(err('body'))} />
          </Field>

          <Checkbox
            name="requires_acknowledgement"
            defaultChecked={block?.requiresAcknowledgement ?? false}
            label="Require a tick before booking"
            hint="Renders a checkbox the traveller must tick, and records the wording, the time and their IP against the booking. Leave off for notices that are shown but not agreed to."
          />

          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={block?.status ?? 'active'}>
              <option value="active">Active — shown wherever placed</option>
              <option value="inactive">Inactive — hidden everywhere</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card
        title="Where it appears"
        description="A block can sit in several places at once. An active block with nothing ticked here is shown to nobody, so saving one is refused."
      >
        <div className="flex flex-col gap-2">
          {PLACEMENTS.map((placement) => {
            const on = placements.includes(placement.value);
            return (
              <label
                key={placement.value}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                  on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary'
                }`}
              >
                <input
                  type="checkbox"
                  name="placement"
                  value={placement.value}
                  checked={on}
                  onChange={(e) =>
                    setPlacements((ps) =>
                      e.target.checked ? [...ps, placement.value] : ps.filter((p) => p !== placement.value)
                    )
                  }
                  className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                />
                <span>
                  <span className="block text-[13px] font-medium text-foreground">{placement.label}</span>
                  <span className="block text-[12px] leading-relaxed text-muted-foreground">{placement.where}</span>
                </span>
              </label>
            );
          })}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {block ? (
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => {
              setRetireError(null);
              startTransition(async () => {
                const result = await retireDisclosureAction(block.id);
                if (result.ok) onDone();
                else setRetireError(result.message);
              });
            }}
          >
            <Archive size={14} aria-hidden="true" />
            Retire
          </Button>
        ) : (
          <span />
        )}
        <SubmitButton>{block ? 'Save disclosure' : 'Create disclosure'}</SubmitButton>
      </div>
    </form>
  );
}
