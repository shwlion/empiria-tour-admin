'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Banner, Card, Checkbox, Field, Input, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { EmailTemplate } from '@/lib/admin/content';
import { saveEmailTemplateAction } from '../../actions';

export default function TemplateForm({ template }: { template: EmailTemplate }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveEmailTemplateAction.bind(null, template.key),
    null
  );
  const err = (k: string) => (state && !state.ok ? state.fields?.[k] : undefined);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      <Link
        href="/dashboard/content/emails"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        All emails
      </Link>

      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      <Card title={template.name} description={template.trigger}>
        <div className="grid gap-4">
          <Field
            label="Subject"
            htmlFor="subject"
            required
            error={err('subject')}
            hint="Merge fields work here too."
          >
            <Input
              id="subject"
              name="subject"
              defaultValue={template.subject}
              placeholder="Your Empiria booking {{booking.reference}} is confirmed"
              error={Boolean(err('subject'))}
            />
          </Field>

          <Field
            label="Body"
            htmlFor="body_html"
            required
            error={err('body_html')}
            hint="HTML. Keep it simple — tables and inline styles survive email clients; stylesheets do not."
          >
            <Textarea
              id="body_html"
              name="body_html"
              rows={16}
              defaultValue={template.bodyHtml}
              error={Boolean(err('body_html'))}
              className="font-mono text-[13px]"
            />
          </Field>

          <Field
            label="Plain text alternative"
            htmlFor="body_text"
            hint="Optional but worth writing. Some clients show it, and spam filters like seeing it."
          >
            <Textarea id="body_text" name="body_text" rows={6} defaultValue={template.bodyText ?? ''} className="font-mono text-[13px]" />
          </Field>

          <Checkbox
            name="is_active"
            defaultChecked={template.isActive}
            label="Send this email"
            hint="Turn off to stop it going out without losing what it says."
          />
        </div>
      </Card>

      <Card
        title="Merge fields"
        description="Written in double braces. Anything not on this list will not be filled in — it will arrive in the email exactly as typed."
      >
        <ul className="flex flex-wrap gap-1.5">
          {template.mergeFields.map((f) => (
            <li
              key={f}
              className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11.5px] text-muted-foreground"
            >
              {`{{${f}}}`}
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] text-muted-foreground">
          Last edited {new Date(template.updatedAt).toLocaleString('en-CA')}
        </p>
        <SubmitButton>Save email</SubmitButton>
      </div>
    </form>
  );
}
