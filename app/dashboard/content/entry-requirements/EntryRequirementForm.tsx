'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive } from 'lucide-react';
import { Banner, Button, Card, Checkbox, Field, Input, Select, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import { COUNTRIES, countryName, isCountryCode } from '@/lib/countries';
import { formatDepartureDate } from '@/lib/money';
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
import {
  REQUIREMENT_KINDS,
  contentChanged,
  noticeDecisionNeeded,
  parseApplyDaysBefore,
  tidyHeadline,
  type EntryRequirementRecord,
} from '@/lib/admin/entryRequirements';
import { retireEntryRequirementAction, saveEntryRequirementAction, type AffectedBooking } from './actions';

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

/** The two answers to the s.37 question (ours, for Empiria's sign-off). There is no default. */
const NOTICE_CHOICES = [
  {
    value: 'tell',
    label: 'Tell them',
    hint: 'Records a notice. Travellers advised under older wording, or with no row for their passport, are sent the current wording by the next send run, once the “Entry requirements changed” email is on. Until then, contact them from the Booked travellers card.',
  },
  {
    value: 'correction',
    label: 'Don’t tell them — this is a correction',
    hint: 'Nobody already booked is told. For a typo, or wording that changes nothing a traveller must do.',
  },
];

export default function EntryRequirementForm({
  record,
  settings,
  committedUpcoming,
  preset,
}: {
  record: EntryRequirementRecord | null;
  /** The disclaimer and other-passport text from Settings, for the preview. */
  settings: EntrySettings;
  /** Committed bookings on upcoming departures, platform-wide. The save counts again. */
  committedUpcoming: number;
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
  const [retiring, startRetire] = useTransition();
  const [retired, setRetired] = useState<ActionResult<{ affected: AffectedBooking[] }> | null>(null);

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

  const statuses = record?.status === 'retired' || status === 'retired' ? ['retired', 'draft', 'active'] : ['draft', 'active'];

  // The server decides again on save; this only decides whether to show the
  // question. A refusal for want of an answer shows it regardless.
  const askNotice =
    noticeDecisionNeeded({
      beforeStatus: record?.status ?? null,
      afterStatus: status,
      contentChanged: contentChanged(record, current),
      bookingsExist: committedUpcoming > 0,
    }) || Boolean(err('notice'));

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}
      {retired && !retired.ok && <Banner tone="error">{retired.message}</Banner>}
      {retired?.ok && (
        <Banner tone="info">
          <p className="font-medium text-foreground">{retired.message}</p>
          {(retired.data?.affected.length ?? 0) > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {retired.data?.affected.map((a) => (
                <li key={a.reference}>
                  {a.reference} — {a.leadName}, {a.leadEmail}, departs {formatDepartureDate(a.startsOn)}
                </li>
              ))}
            </ul>
          )}
        </Banner>
      )}

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

      {askNotice && (
        <Card
          title="People already booked"
          description={`Travellers hold bookings on upcoming departures, and this save changes what someone on a ${countryName(passport) ?? 'this'} passport is shown for ${countryName(destination) ?? 'this country'}. Choose whether to tell those already booked. There is no default.`}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Tell the travellers already booked?</legend>
            {NOTICE_CHOICES.map((choice) => (
              <label
                key={choice.value}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:border-primary"
              >
                <input type="radio" name="notice" value={choice.value} required className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                <span>
                  <span className="block text-[13px] font-medium text-foreground">{choice.label}</span>
                  <span className="block text-[12px] leading-relaxed text-muted-foreground">{choice.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {err('notice') && <p className="mt-2 text-[12px] font-medium text-destructive">{err('notice')}</p>}
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {record && record.status !== 'retired' && !retired?.ok ? (
          <Button
            type="button"
            variant="danger"
            disabled={retiring}
            onClick={() => {
              if (!window.confirm('Retire this row? Travellers on this passport see the other-passport text instead. Retiring tells nobody by itself; the Booked travellers card lists who to contact.')) return;
              setRetired(null);
              startRetire(async () => {
                const result = await retireEntryRequirementAction(record.id);
                setRetired(result);
                // The page reloads the row; the select must not keep offering the old status.
                if (result.ok) setStatus('retired');
              });
            }}
          >
            <Archive size={14} aria-hidden="true" />
            Retire
          </Button>
        ) : (
          <span />
        )}
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
