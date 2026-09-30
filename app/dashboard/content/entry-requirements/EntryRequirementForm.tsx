'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Card, Checkbox, Field, Input, Select, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import { COUNTRIES, countryName, isCountryCode } from '@/lib/countries';
import {
  ENTRY_COPY,
  REQUIREMENT_CAPTIONS,
  composeEntryAdvice,
  entryAlert,
  type ComposedAdvice,
  type EntryAlert,
  type EntrySettings,
  type RequirementKind,
  type ResolvedEntry,
  type Urgency,
} from '@/lib/entryAdvice';
import { REQUIREMENT_KINDS, parseApplyDaysBefore, tidyHeadline, type EntryRequirementRecord } from '@/lib/admin/entryRequirements';
import { saveEntryRequirementAction } from './actions';

/**
 * One destination × passport row: Empiria's headline, words and lead time,
 * the links, the status, and a preview of the tour page's alert made by the
 * storefront's own composer (`lib/entryAdvice.ts`, copied byte for byte), so
 * what staff read is what a traveller reads.
 */

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft — not shown to travellers',
  active: 'Active — shown to travellers on this passport',
  retired: 'Retired — no longer shown',
};

/** As the save stores it: one kind of line break, trimmed, blank as null. */
const tidy = (value: string) => value.replace(/\r\n?/g, '\n').trim();

export default function EntryRequirementForm({
  record,
  settings,
  preset,
}: {
  record: EntryRequirementRecord | null;
  /** The disclaimer and other-passport text from Settings, for the preview. */
  settings: EntrySettings;
  /** For a new row: the countries "Add a passport" was pressed for. */
  preset: { destination: string | null; passport: string | null };
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    saveEntryRequirementAction.bind(null, record?.id ?? null),
    null
  );
  const err = (k: string) => (state && !state.ok ? state.fields?.[k] : undefined);

  const [destination, setDestination] = useState(record?.destinationCountry ?? preset.destination ?? '');
  // Canada unless the tour is in Canada: its advice is TICO's online minimum.
  const [passport, setPassport] = useState(record?.passportCountry ?? preset.passport ?? (preset.destination === 'CA' ? '' : 'CA'));
  const [requirement, setRequirement] = useState<RequirementKind>(record?.requirement ?? 'none');
  const [headline, setHeadline] = useState(record?.headline ?? '');
  const [beforeArrival, setBeforeArrival] = useState(record?.beforeArrival ?? '');
  const [why, setWhy] = useState(record?.why ?? '');
  const [processingTime, setProcessingTime] = useState(record?.processingTime ?? '');
  const [applyDaysBefore, setApplyDaysBefore] = useState(String(record?.applyDaysBefore ?? ''));
  const [applyUrl, setApplyUrl] = useState(record?.applyUrl ?? '');
  const [officialUrl, setOfficialUrl] = useState(record?.officialUrl ?? '');
  const [status, setStatus] = useState<string>(record?.status ?? 'draft');

  // A new row lands on its own page once it exists.
  useEffect(() => {
    if (state?.ok && state.data?.id && !record) router.push(`/dashboard/content/entry-requirements/${state.data.id}`);
  }, [state, record, router]);

  const lead = parseApplyDaysBefore(applyDaysBefore);
  const current = {
    requirement,
    headline: tidyHeadline(headline),
    beforeArrival: tidy(beforeArrival),
    why: tidy(why) || null,
    processingTime: tidy(processingTime) || null,
    // An invalid lead time is previewed as none; the save refuses it.
    applyDaysBefore: lead === 'invalid' ? null : lead,
    applyUrl: tidy(applyUrl) || null,
    officialUrl: tidy(officialUrl) || null,
  };

  // The tour page's alert for this row, with the advice inside it. No date:
  // the tour page has no departure chosen, so it names none.
  const resolved: ResolvedEntry | null =
    isCountryCode(destination) && isCountryCode(passport) && destination !== passport && current.beforeArrival
      ? {
          state: 'advised',
          destinationCountry: destination,
          passportCountry: passport,
          row: { id: record?.id ?? 'new', ...current, contentVersion: record?.contentVersion ?? 1 },
        }
      : null;
  const alert = resolved ? entryAlert(resolved) : null;
  const advice = resolved ? composeEntryAdvice(resolved, settings) : null;

  const statuses = record?.status === 'retired' ? ['retired', 'draft', 'active'] : ['draft', 'active'];

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      <Card
        title="Who it is for"
        description={
          record
            ? 'Fixed once the row exists: each booking’s advice record names this pair. To change it, retire this row and add another.'
            : 'The country the tour is in, and the passport the traveller travels on.'
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Destination country" htmlFor="destination_country" required error={err('destination_country')}>
            <Select
              id="destination_country"
              name="destination_country"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={Boolean(record)}
              required
              error={Boolean(err('destination_country'))}
            >
              <option value="">Choose…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Passport country"
            htmlFor="passport_country"
            required
            hint="Canada first: the Canadian-passport advice is TICO’s online minimum, and what anyone without a profile country sees."
            error={err('passport_country')}
          >
            <Select
              id="passport_country"
              name="passport_country"
              value={passport}
              onChange={(e) => setPassport(e.target.value)}
              disabled={Boolean(record)}
              required
              error={Boolean(err('passport_country'))}
            >
              <option value="">Choose…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card
        title="The advice"
        description="Every word here is Empiria’s and is shown to travellers as written. Bare https addresses become links on the site."
      >
        <div className="grid gap-4">
          <Field
            label="Requirement"
            htmlFor="requirement"
            required
            hint="Visa and eVisa show red; an eTA, a visa on arrival or no visa shows amber."
            error={err('requirement')}
          >
            <Select
              id="requirement"
              name="requirement"
              value={requirement}
              onChange={(e) => setRequirement(e.target.value as RequirementKind)}
              error={Boolean(err('requirement'))}
            >
              {REQUIREMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {REQUIREMENT_CAPTIONS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Headline — what travellers must do, in one line"
            htmlFor="headline"
            hint="Shown first, in large type, everywhere the advice appears. Up to 160 characters."
            error={err('headline')}
          >
            <Input
              id="headline"
              name="headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              error={Boolean(err('headline'))}
            />
          </Field>
          <Field
            label="Before you arrive"
            htmlFor="before_arrival"
            required
            hint="Empiria’s words, shown as written: passport validity, forms, a letter for a child travelling with one parent, vaccinations."
            error={err('before_arrival')}
          >
            <Textarea
              id="before_arrival"
              name="before_arrival"
              rows={6}
              value={beforeArrival}
              onChange={(e) => setBeforeArrival(e.target.value)}
              error={Boolean(err('before_arrival'))}
            />
          </Field>
          <Field label="Why" htmlFor="why" hint="Empiria’s words, shown as written: why it is needed. Optional.">
            <Textarea id="why" name="why" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} />
          </Field>
          <Field label="How long it takes" htmlFor="processing_time" hint="Empiria’s words, shown as written: how long it usually takes to obtain. Optional.">
            <Textarea id="processing_time" name="processing_time" rows={2} value={processingTime} onChange={(e) => setProcessingTime(e.target.value)} />
          </Field>
          <Field
            label="Apply at least … days before departure"
            htmlFor="apply_days_before"
            hint="Turns into “Apply by <date>” for each booking, and warns people booking later than this. Leave it blank when there is nothing to apply for ahead."
            error={err('apply_days_before')}
            className="sm:max-w-md"
          >
            <Input
              id="apply_days_before"
              name="apply_days_before"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              step={1}
              value={applyDaysBefore}
              onChange={(e) => setApplyDaysBefore(e.target.value)}
              error={Boolean(err('apply_days_before'))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Where to apply" htmlFor="apply_url" hint="Shown under “Apply”, and behind the alert’s “Apply online” button. https only." error={err('apply_url')}>
              <Input
                id="apply_url"
                name="apply_url"
                type="url"
                value={applyUrl}
                onChange={(e) => setApplyUrl(e.target.value)}
                placeholder="https://…"
                error={Boolean(err('apply_url'))}
              />
            </Field>
            <Field label="Official page" htmlFor="official_url" hint="The government page the disclaimer points to. https only." error={err('official_url')}>
              <Input
                id="official_url"
                name="official_url"
                type="url"
                value={officialUrl}
                onChange={(e) => setOfficialUrl(e.target.value)}
                placeholder="https://travel.gc.ca/destinations/…"
                error={Boolean(err('official_url'))}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Status">
        <div className="grid gap-4">
          <Field label="Shown" htmlFor="status" error={err('status')}>
            <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)} error={Boolean(err('status'))}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Checkbox
            name="checked"
            label="Checked against official sources today"
            hint={`Stamps today as the last check (last checked: ${record?.checkedOn ?? 'never'}). The overview flags an active row not checked for 180 days.`}
          />
        </div>
      </Card>

      <Card
        title="As a traveller sees it"
        description="The tour page’s alert, drawn by the storefront’s own composer from what is typed above, with the disclaimer and other-passport text from Settings. Like the tour page, it names no date: each booking’s “Apply by” date is worked out from its departure. The site turns the addresses into links."
      >
        {alert ? (
          <>
            <p className="mb-3 text-[13px] text-muted-foreground">
              What {countryName(passport) ?? passport} passport holders see on the tour page.
            </p>
            <AlertPreview alert={alert} advice={advice} />
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">Choose two different countries and write “Before you arrive” to see it.</p>
        )}
        {status !== 'active' && (
          <p className="mt-2 text-[12px] text-muted-foreground">Nobody sees this until the status is active.</p>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <SubmitButton>{record ? 'Save' : 'Create'}</SubmitButton>
      </div>
    </form>
  );
}

/**
 * The mockup's colour tokens (spec, "v2 interface contract"). The alert sits
 * on the background with a line-coloured border; the kicker and the facts
 * take the text colour; the lead time, "Apply online" and the "!" are filled
 * with the strong colour, in white.
 */
const TONE: Record<Urgency, { box: string; line: string; text: string; strong: string }> = {
  red: { box: 'border-[#f5c2bd] bg-[#fef3f2]', line: 'border-[#f5c2bd]', text: 'text-[#b42318]', strong: 'bg-[#d92d20]' },
  amber: { box: 'border-[#f7d98b] bg-[#fffaeb]', line: 'border-[#f7d98b]', text: 'text-[#a15c07]', strong: 'bg-[#b54708]' },
};

/**
 * The tour page's alert, redrawn for the console from the same words: the
 * kicker, the headline, the place line, the facts, "Apply online", and the
 * composed advice inside. No nudge and no contact line, which the tour page
 * adds beside it. Nothing here is a link: a preview is for reading.
 */
function AlertPreview({ alert, advice }: { alert: EntryAlert; advice: ComposedAdvice | null }) {
  const tone = TONE[alert.urgency];
  return (
    <div className={`rounded-2xl border-[1.5px] p-4 ${tone.box}`}>
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[18px] font-extrabold text-white ${tone.strong}`}
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className={`font-mono text-[11px] font-medium uppercase tracking-[0.12em] ${tone.text}`}>{alert.kicker}</p>
          <p className="mt-1 text-[19px] font-bold leading-snug text-foreground">{alert.headline}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{alert.place}</p>
          {(alert.requirement !== null || alert.applyDaysBefore !== null) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {alert.requirement !== null && (
                <span className={`rounded-full border bg-white px-3 py-1.5 text-[13px] font-semibold ${tone.line} ${tone.text}`}>
                  {alert.requirement}
                </span>
              )}
              {alert.applyDaysBefore !== null && (
                <span className={`rounded-full px-3 py-1.5 text-[13px] font-semibold text-white ${tone.strong}`}>
                  {ENTRY_COPY.applyAtLeast(alert.applyDaysBefore)}
                </span>
              )}
            </div>
          )}
          {alert.applyUrl !== null && (
            <span
              title={alert.applyUrl}
              className={`mt-3 inline-flex rounded-full px-4 py-2 text-[14px] font-bold text-white ${tone.strong}`}
            >
              {ENTRY_COPY.applyOnline} ↗
            </span>
          )}
        </div>
      </div>
      {advice && (
        <div className="mt-4 rounded-xl border border-border bg-white p-4">
          <p className="text-[14px] font-semibold text-foreground">{advice.label}</p>
          <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-foreground">{advice.body}</p>
        </div>
      )}
    </div>
  );
}
