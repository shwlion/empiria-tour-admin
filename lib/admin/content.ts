import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Content — the rest of Exhibit A B6.
 *
 * Three things the public site already renders and nobody could edit: the four
 * policy pages, the disclosure blocks that carry Part D, and the eleven
 * transactional email templates. All three existed as rows with placeholder or
 * empty bodies, which is the worst of both worlds — the mechanism works, so
 * nothing looks broken, and the words are wrong.
 *
 * Plus the landing page's four postcards (migration 0012), which shipped with
 * Elevsoft's stand-in photographs for the same reason.
 */

// ─── Static pages ─────────────────────────────────────────────────────────

export type StaticPage = {
  slug: string;
  title: string;
  body: string;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
};

/**
 * The four the storefront has routes for.
 *
 * These slugs are load-bearing: `app/terms/page.tsx` and its three siblings
 * pass them to `getStaticPage()` and call `notFound()` when the row is missing.
 * Renaming one takes a page off the site, and the footer links to all four — so
 * the editor treats the slug as fixed and only the contents as editable.
 */
export const REQUIRED_PAGES: { slug: string; title: string; route: string; why: string }[] = [
  { slug: 'terms', title: 'Terms of service', route: '/terms', why: 'Linked in the footer of every page.' },
  { slug: 'privacy', title: 'Privacy policy', route: '/privacy', why: 'Linked from the footer and from the cookie banner.' },
  { slug: 'booking-conditions', title: 'Booking conditions', route: '/booking-conditions', why: 'Linked from the Terms step of the booking flow.' },
  { slug: 'cancellation', title: 'Cancellation policy', route: '/cancellation', why: 'Linked from the Terms step and from every booking.' },
  { slug: 'about', title: 'About Empiria Tours', route: '/about', why: 'Linked in the footer. §2.2 makes Empiria the seller of record, and this is where the site says who that is.' },
  { slug: 'contact', title: 'Contact us', route: '/contact', why: 'Linked in the footer and promised by the trust band on the home page.' },
  { slug: 'faq', title: 'Frequently asked questions', route: '/faq', why: 'Linked in the footer.' },
];

export async function listStaticPages(): Promise<StaticPage[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data } = await db.from('static_pages').select('*').order('slug');
  return (data ?? []).map((p) => ({
    slug: p.slug,
    title: p.title,
    body: p.body,
    metaTitle: p.meta_title,
    metaDescription: p.meta_description,
    updatedAt: p.updated_at,
  }));
}

export async function getStaticPage(slug: string): Promise<StaticPage | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db.from('static_pages').select('*').eq('slug', slug).maybeSingle();
  if (!data) return null;
  return {
    slug: data.slug,
    title: data.title,
    body: data.body,
    metaTitle: data.meta_title,
    metaDescription: data.meta_description,
    updatedAt: data.updated_at,
  };
}

// ─── Disclosure blocks ────────────────────────────────────────────────────

/**
 * Every placement the platform renders, with the name an operator would use.
 *
 * The database constrains `disclosure_placements.placement` to exactly these
 * nine strings; this is the same list with the jargon removed. Ordered by where
 * a traveller meets them, not alphabetically — that is the order somebody
 * assigning wording is thinking in.
 */
export const PLACEMENTS: { value: string; label: string; where: string }[] = [
  { value: 'package_page', label: 'Tour page', where: 'Below the itinerary, before anyone books.' },
  { value: 'booking_travellers', label: 'Booking · Travellers', where: 'Step 1, while names are being entered.' },
  { value: 'booking_additional', label: 'Booking · Extras', where: 'Step 2, alongside rooms and add-ons.' },
  { value: 'booking_review', label: 'Booking · Review', where: 'Step 3, beside the itemised total.' },
  { value: 'booking_terms', label: 'Booking · Terms', where: 'Step 4. The last thing before places are reserved.' },
  { value: 'booking_payment', label: 'Booking · Payment', where: 'Step 5, on the payment page.' },
  { value: 'receipt', label: 'Receipts', where: 'On the receipt document.' },
  { value: 'email_confirmation', label: 'Confirmation email', where: 'In the booking confirmation.' },
  { value: 'footer', label: 'Site footer', where: 'Every page of the public site.' },
];

export type DisclosureBlock = {
  id: string;
  slug: string;
  name: string;
  body: string;
  requiresAcknowledgement: boolean;
  status: string;
  updatedAt: string;
  /** Placement values this block is assigned to, across all packages. */
  placements: string[];
  /** How many bookings have already agreed to this wording. */
  acknowledgedCount: number;
};

export async function listDisclosureBlocks(): Promise<DisclosureBlock[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const [{ data: blocks }, { data: placements }, { data: acks }] = await Promise.all([
    db.from('disclosure_blocks').select('*').order('name'),
    db.from('disclosure_placements').select('block_id, placement'),
    db.from('booking_acknowledgements').select('block_id'),
  ]);
  if (!blocks?.length) return [];

  const byBlock = new Map<string, string[]>();
  for (const p of placements ?? []) {
    const list = byBlock.get(p.block_id) ?? [];
    if (!list.includes(p.placement)) list.push(p.placement);
    byBlock.set(p.block_id, list);
  }

  const ackCount = new Map<string, number>();
  for (const a of acks ?? []) {
    if (!a.block_id) continue;
    ackCount.set(a.block_id, (ackCount.get(a.block_id) ?? 0) + 1);
  }

  return blocks.map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    body: b.body,
    requiresAcknowledgement: b.requires_acknowledgement,
    status: b.status,
    updatedAt: b.updated_at,
    placements: byBlock.get(b.id) ?? [],
    acknowledgedCount: ackCount.get(b.id) ?? 0,
  }));
}

export async function getDisclosureBlock(id: string): Promise<DisclosureBlock | null> {
  const all = await listDisclosureBlocks();
  return all.find((b) => b.id === id) ?? null;
}

// ─── Email templates ──────────────────────────────────────────────────────

/**
 * What each template may refer to.
 *
 * Part C is not built — nothing sends yet — so this is the contract being
 * written down before there is code depending on it, rather than discovered
 * from whatever the first sender happened to pass. The editor shows the list
 * beside the body so nobody has to guess a name and find out by sending.
 */
const COMMON_FIELDS = ['company.name', 'company.registration_number', 'company.contact_email'];

export const MERGE_FIELDS: Record<string, string[]> = {
  booking_confirmed: ['booking.reference', 'booking.total', 'traveller.name', 'package.title', 'departure.date', 'departure.meeting_point', 'booking.travellers'],
  deposit_taken: ['booking.reference', 'payment.amount', 'booking.balance', 'booking.balance_due_on', 'traveller.name', 'package.title', 'departure.date'],
  balance_due: ['booking.reference', 'booking.balance', 'booking.balance_due_on', 'traveller.name', 'package.title', 'departure.date', 'payment.link'],
  balance_paid: ['booking.reference', 'payment.amount', 'booking.total', 'traveller.name', 'package.title', 'departure.date'],
  pre_departure: ['booking.reference', 'traveller.name', 'package.title', 'departure.date', 'departure.meeting_point', 'departure.start_time', 'package.what_to_bring'],
  booking_cancelled: ['booking.reference', 'traveller.name', 'package.title', 'departure.date', 'booking.refund_due'],
  booking_amended: ['booking.reference', 'traveller.name', 'package.title', 'departure.date', 'booking.changes'],
  departure_change: ['booking.reference', 'traveller.name', 'package.title', 'departure.old_date', 'departure.date', 'departure.reason'],
  refund_issued: ['booking.reference', 'payment.amount', 'traveller.name', 'package.title', 'payment.method'],
  account_created: ['traveller.name', 'account.email', 'account.confirm_link'],
  admin_alert: ['booking.reference', 'booking.total', 'traveller.name', 'package.title', 'departure.date', 'booking.admin_link'],
  installment_due: ['booking.reference', 'installment.number', 'installment.of', 'installment.amount', 'installment.due_on', 'installment.remaining', 'traveller.name', 'package.title', 'departure.date', 'payment.link'],
  installment_paid: ['booking.reference', 'installment.number', 'installment.of', 'payment.amount', 'installment.remaining', 'traveller.name', 'package.title', 'departure.date'],
  partner_application_received: ['applicant.name', 'applicant.company'],
  partner_application_approved: ['applicant.name', 'applicant.company', 'partner.console_link'],
  partner_application_declined: ['applicant.name', 'applicant.company', 'application.note'],
  partner_application_alert: ['applicant.name', 'applicant.company', 'application.admin_link'],
};

/** When each one is sent, in the words of somebody deciding what it should say. */
export const TEMPLATE_TRIGGERS: Record<string, string> = {
  booking_confirmed: 'The first payment clears and the places become theirs.',
  deposit_taken: 'A deposit clears and a balance remains outstanding.',
  balance_due: 'Ahead of the balance due date on a part-paid booking.',
  balance_paid: 'The balance clears and nothing further is owed.',
  pre_departure: 'Shortly before departure, with the practical details.',
  booking_cancelled: 'A booking is cancelled, by the traveller or by Empiria.',
  booking_amended: 'Staff change something on an existing booking.',
  departure_change: 'A departure is rescheduled or its details change.',
  refund_issued: 'A refund is sent back to the original card.',
  account_created: 'Somebody signs up.',
  admin_alert: 'A new booking arrives, sent to Empiria rather than the traveller.',
  installment_due: 'Ahead of an installment date, once installments exist.',
  installment_paid: 'An installment clears, once installments exist.',
  partner_application_received: 'A tour operator applies to sell through Empiria.',
  partner_application_approved: 'Empiria approves the application; the console is theirs.',
  partner_application_declined: 'Empiria declines the application, with a note.',
  partner_application_alert: 'A tour operator applies — sent to Empiria, not the applicant.',
};

export type EmailTemplate = {
  key: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  isActive: boolean;
  updatedAt: string;
  mergeFields: string[];
  trigger: string;
  /** Written at all yet? Every row shipped empty. */
  isEmpty: boolean;
};

function decorate(t: {
  key: string; name: string; subject: string; body_html: string;
  body_text: string | null; is_active: boolean; updated_at: string;
}): EmailTemplate {
  return {
    key: t.key,
    name: t.name,
    subject: t.subject,
    bodyHtml: t.body_html,
    bodyText: t.body_text,
    isActive: t.is_active,
    updatedAt: t.updated_at,
    mergeFields: [...(MERGE_FIELDS[t.key] ?? []), ...COMMON_FIELDS],
    trigger: TEMPLATE_TRIGGERS[t.key] ?? '',
    isEmpty: t.body_html.trim() === '' || t.subject.trim() === '',
  };
}

export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data } = await db.from('email_templates').select('*').order('key');
  return (data ?? []).map(decorate);
}

export async function getEmailTemplate(key: string): Promise<EmailTemplate | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db.from('email_templates').select('*').eq('key', key).maybeSingle();
  return data ? decorate(data) : null;
}

// ─── Showcase postcards ───────────────────────────────────────────────────

/**
 * How many postcards the landing page shows. `getShowcaseCards()` in the
 * storefront's `lib/catalogue.ts` takes the first four published rows, so a
 * fifth published card is never seen and a third leaves a hole in the deck.
 */
export const SHOWCASE_SLOTS = 4;

/** Migration 0012's check constraints, so the form can refuse before the database has to. */
export const SHOWCASE_LIMITS = { title: 60, kicker: 40, description: 140 } as const;

export type ShowcaseCardRecord = {
  id: string;
  title: string;
  /** A mood line — "Islands · Slow travel" — never a date or a price. */
  kicker: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  /** A storefront path; the expanded postcard's one button goes here. */
  linkUrl: string;
  sortOrder: number;
  status: 'draft' | 'published';
  updatedAt: string;
};

function toShowcaseCard(r: {
  id: string; title: string; kicker: string; description: string; image_url: string;
  image_alt: string; link_url: string; sort_order: number; status: string; updated_at: string;
}): ShowcaseCardRecord {
  return {
    id: r.id,
    title: r.title,
    kicker: r.kicker,
    description: r.description,
    imageUrl: r.image_url,
    imageAlt: r.image_alt,
    linkUrl: r.link_url,
    sortOrder: r.sort_order,
    // The database constrains it to these two; narrowing here keeps the
    // editor's Publish/Unpublish switch honest without a cast at each use.
    status: r.status === 'published' ? 'published' : 'draft',
    updatedAt: r.updated_at,
  };
}

/** Every card, drafts included, in the order the landing page would show them. */
export async function listShowcaseCards(): Promise<ShowcaseCardRecord[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from('showcase_cards')
    .select('*')
    .order('sort_order')
    .order('created_at');
  return (data ?? []).map(toShowcaseCard);
}

export async function getShowcaseCard(id: string): Promise<ShowcaseCardRecord | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db.from('showcase_cards').select('*').eq('id', id).maybeSingle();
  return data ? toShowcaseCard(data) : null;
}

// ─── What is still missing ────────────────────────────────────────────────

export type ContentGap = { area: string; detail: string; href: string };

/**
 * The content equivalent of `settingsGaps` — what the public site is currently
 * showing that Empiria has not actually written.
 */
export async function contentGaps(): Promise<ContentGap[]> {
  const [pages, blocks, templates, cards] = await Promise.all([
    listStaticPages(),
    listDisclosureBlocks(),
    listEmailTemplates(),
    listShowcaseCards(),
  ]);
  const gaps: ContentGap[] = [];

  for (const required of REQUIRED_PAGES) {
    const page = pages.find((p) => p.slug === required.slug);
    if (!page) {
      gaps.push({
        area: required.title,
        detail: `${required.route} currently returns "not found" — the page has no row at all.`,
        href: `/dashboard/content/pages/${required.slug}`,
      });
    } else if (page.body.trim().length < 200) {
      gaps.push({
        area: required.title,
        detail: 'Still placeholder text. This is a page travellers are pointed at before they book.',
        href: `/dashboard/content/pages/${required.slug}`,
      });
    }
  }

  const unplaced = blocks.filter((b) => b.status === 'active' && b.placements.length === 0);
  if (unplaced.length) {
    gaps.push({
      area: 'Disclosures',
      detail: `${unplaced.length} active ${unplaced.length === 1 ? 'block appears' : 'blocks appear'} nowhere on the site — active but unplaced shows to nobody.`,
      href: '/dashboard/content/disclosures',
    });
  }

  const empty = templates.filter((t) => t.isEmpty);
  if (empty.length) {
    gaps.push({
      area: 'Emails',
      detail: `${empty.length} of ${templates.length} templates are unwritten. Nothing sends yet, but they are what will.`,
      href: '/dashboard/content/emails',
    });
  }

  // The hero deck has exactly four slots. Fewer leaves a gap on the landing
  // page; more means somebody published a card that nobody will ever see.
  const published = cards.filter((c) => c.status === 'published').length;
  if (published !== SHOWCASE_SLOTS) {
    gaps.push({
      area: 'Showcase',
      detail:
        published === 0
          ? 'No postcards are published — the landing page hero has nothing to show.'
          : `${published} ${published === 1 ? 'postcard is' : 'postcards are'} published; the landing page shows ${SHOWCASE_SLOTS}.`,
      href: '/dashboard/content/showcase',
    });
  }

  return gaps;
}
