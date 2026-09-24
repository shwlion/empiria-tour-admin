/**
 * Which merge fields a template names that its email cannot fill.
 *
 * The storefront's renderer (`lib/email/render.ts` there) throws on any
 * {{field}} a template may not use, and the outbox then marks that message
 * failed for good. That is the right call for one message — "Dear
 * {{traveller.name}}" reaching a traveller is worse than nothing reaching
 * them — but it means a typo saved here stops every email of that kind, and
 * correcting the template later sends none of the ones already failed. So the
 * console checks at save, against the same per-email list the editor shows.
 *
 * Three repositories and no shared package, so the pattern is copied, as
 * parseTaxRules is: keep it in step with PLACEHOLDER in the storefront's
 * render.ts by hand. Like the renderer, the match ignores case but the lookup
 * does not, so {{Booking.Reference}} is refused here exactly as it would be
 * there. Braces around something that is not a field name at all
 * ({{booking-ref}}) match neither, and arrive in the email as typed.
 *
 * Pure, and asserted in `emailTemplates.test.ts`.
 */

const PLACEHOLDER = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

/** Every {{field}} in `source` that `allowed` does not offer, in the order first written. */
export function unknownMergeFields(allowed: readonly string[], source: string | null | undefined): string[] {
  if (!source) return [];
  const offered = new Set(allowed);
  const unknown: string[] = [];
  for (const match of source.matchAll(PLACEHOLDER)) {
    const field = match[1];
    if (!offered.has(field) && !unknown.includes(field)) unknown.push(field);
  }
  return unknown;
}

/**
 * The save's verdict on the three parts of a template, keyed by the form's
 * field names, or null when every placeholder is one this email can fill.
 * All three are checked because the renderer substitutes all three: a typo in
 * the optional plain-text body stops the email as surely as one in the body.
 */
export function mergeFieldErrors(
  allowed: readonly string[],
  parts: { subject: string; body_html: string; body_text: string | null }
): Record<string, string> | null {
  const errors: Record<string, string> = {};
  for (const [name, source] of Object.entries(parts)) {
    const unknown = unknownMergeFields(allowed, source);
    if (unknown.length > 0) {
      errors[name] = `Not a field this email can fill: ${unknown.map((f) => `{{${f}}}`).join(', ')}`;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
