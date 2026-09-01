'use client';

import { useActionState } from 'react';
import { Banner, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import { approveApplicationAction, declineApplicationAction } from '../actions';

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <Banner tone={state.ok ? 'success' : 'error'}>{state.message ?? 'Done.'}</Banner>
  );
}

export function ApproveForm({
  applicationId, kind, detail,
}: {
  applicationId: string; kind: 'promote' | 'invite'; detail: string;
}) {
  const [state, formAction] = useActionState(approveApplicationAction.bind(null, applicationId), null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Result state={state} />
      <p className="text-[13px] leading-relaxed text-muted-foreground">{detail}</p>
      <Textarea
        name="review_note"
        rows={2}
        placeholder="What you checked, for the record. Optional."
        aria-label="Approval note"
      />
      <div>
        <SubmitButton>
          {kind === 'promote' ? 'Approve and promote their account' : 'Approve and send an invitation'}
        </SubmitButton>
      </div>
    </form>
  );
}

export function DeclineForm({ applicationId }: { applicationId: string }) {
  const [state, formAction] = useActionState(declineApplicationAction.bind(null, applicationId), null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Result state={state} />
      <Textarea
        name="review_note"
        rows={3}
        required
        placeholder="Why. This is sent to them, so write it as though they will read it — because they will."
        aria-label="Reason for declining"
      />
      <div>
        <SubmitButton variant="secondary">Decline</SubmitButton>
      </div>
    </form>
  );
}
