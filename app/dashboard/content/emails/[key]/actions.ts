'use server';

import { requireCapability } from '@/lib/auth';
import { fail, nullable, text, type ActionResult } from '@/lib/actions';
import { getEmailTemplate } from '@/lib/admin/content';
import { mergeFieldErrors } from '@/lib/admin/emailTemplates';
import { saveEmailTemplateAction } from '../../actions';

/**
 * Saving an email template — refused while it names a field its email
 * cannot fill.
 *
 * The storefront's renderer fails a message rather than send a placeholder
 * unfilled, and the outbox does not retry it. A template saved with
 * {{booking.ref}} for {{booking.reference}} would therefore stop every
 * message of its kind, silently, until somebody read a booking's send log —
 * and correcting it afterwards sends none of the ones already failed. So the
 * three parts are checked here, against the same per-email list the editor
 * shows beside the body, before the shared save in content/actions.ts writes
 * anything.
 */
export async function saveTemplateAction(
  key: string,
  prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  await requireCapability('manageSettings');

  // With no template to read (or no database), the save below says so.
  const template = await getEmailTemplate(key);
  if (template) {
    const fields = mergeFieldErrors(template.mergeFields, {
      subject: text(form.get('subject')),
      body_html: text(form.get('body_html')),
      body_text: nullable(form.get('body_text')),
    });
    if (fields) {
      return fail(
        'Not saved: this names a merge field the email cannot fill, and an email like that fails rather than sends. Use a field from the list below.',
        fields
      );
    }
  }

  return saveEmailTemplateAction(key, prev, form);
}
