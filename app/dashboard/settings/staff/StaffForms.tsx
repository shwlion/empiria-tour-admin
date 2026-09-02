'use client';

import { useActionState } from 'react';
import { Banner, Input, Select, SubmitButton } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import { inviteStaffAction, setRoleAction, setStatusAction } from './actions';

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return <Banner tone={state.ok ? 'success' : 'error'}>{state.message ?? 'Done.'}</Banner>;
}

export function InviteForm({ roles }: { roles: readonly { value: string; label: string; detail: string }[] }) {
  const [state, formAction] = useActionState(inviteStaffAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-foreground">
            Email
          </label>
          <Input id="email" name="email" type="email" required placeholder="name@empiria.com" />
        </div>
        <div>
          <label htmlFor="full_name" className="mb-1.5 block text-[13px] font-medium text-foreground">
            Name
          </label>
          <Input id="full_name" name="full_name" placeholder="Optional" />
        </div>
      </div>
      <div>
        <label htmlFor="role" className="mb-1.5 block text-[13px] font-medium text-foreground">
          Role
        </label>
        <Select id="role" name="role" defaultValue="agent">
          {roles.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Select>
        <ul className="mt-2 flex flex-col gap-1">
          {roles.map((r) => (
            <li key={r.value} className="text-[12px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{r.label}.</span> {r.detail}
            </li>
          ))}
        </ul>
      </div>
      <div><SubmitButton>Send the invitation</SubmitButton></div>
    </form>
  );
}

export function RoleForm({
  userId, role, blocked, roles,
}: {
  userId: string;
  role: string;
  blocked: string | null;
  roles: readonly { value: string; label: string }[];
}) {
  const [state, formAction] = useActionState(setRoleAction.bind(null, userId), null);
  if (blocked) {
    return <p className="text-[12px] leading-relaxed text-muted-foreground">{blocked}</p>;
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Select name="role" defaultValue={role} aria-label="Role" className="w-auto">
        {roles.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </Select>
      <SubmitButton variant="secondary">Change</SubmitButton>
      {state && !state.ok && (
        <p className="w-full text-[12px] text-destructive">{state.message}</p>
      )}
      {state?.ok && <p className="w-full text-[12px] text-muted-foreground">{state.message}</p>}
    </form>
  );
}

export function StatusForm({
  userId, status, blocked,
}: {
  userId: string; status: string; blocked: string | null;
}) {
  const next = status === 'closed' ? 'active' : 'closed';
  const [state, formAction] = useActionState(setStatusAction.bind(null, userId), null);
  if (blocked) return null;
  return (
    <form action={formAction}>
      <input type="hidden" name="status" value={next} />
      <SubmitButton variant="secondary">
        {status === 'closed' ? 'Reopen' : 'Close access'}
      </SubmitButton>
      {state && !state.ok && (
        <p className="mt-1 text-[12px] text-destructive">{state.message}</p>
      )}
    </form>
  );
}
