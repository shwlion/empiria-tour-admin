import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge, Banner, Card, PageHeader, Table } from '@/components/ui';
import { formatDepartureDate } from '@/lib/money';
import { requireCapability } from '@/lib/auth';
import { STAFF_ROLES, countActiveAdmins, listStaff, permittedActions } from '@/lib/admin/staff';
import { InviteForm, RoleForm, StatusForm } from './StaffForms';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Staff · Empiria Tour Admin' };

/**
 * B6: staff invitation, role assignment and deactivation.
 *
 * Two things this page is careful about. It never offers a control the database
 * would refuse — the last active administrator cannot be demoted or closed, and
 * nobody can act on themselves, so those rows show the reason instead of a
 * button. And it does not pretend to be the customer directory: only admins and
 * agents are listed, because travellers are B4 and partners have their own
 * screen with an application behind each one.
 */
export default async function StaffPage() {
  const viewer = await requireCapability('manageSettings');
  const [staff, activeAdmins] = await Promise.all([listStaff(), countActiveAdmins()]);

  return (
    <>
      <Link
        href="/dashboard/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Platform settings
      </Link>

      <PageHeader
        title="Staff"
        description="Who can open this console, and what they can reach once they are in. Every change here is recorded against the person who made it."
      />

      {activeAdmins <= 1 && (
        <Banner tone="info">
          <p className="font-medium">There is one active administrator.</p>
          <p className="mt-1">
            Until there is a second, that account cannot be closed or demoted — the platform would
            have nobody able to administer it. Inviting another administrator is the fix, and it
            also means somebody can help when the first person is unavailable.
          </p>
        </Banner>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Who has access">
            {staff.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Nobody yet. The first administrator is created directly in the database on purpose —
                any in-app way to claim that role would be a way for somebody else to claim it.
              </p>
            ) : (
              <Table head={['Person', 'Role', 'Since', 'Access', '']}>
                {staff.map((s) => {
                  const allowed = permittedActions(s, viewer.id, activeAdmins);
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {s.fullName ?? s.email ?? 'Unnamed'}
                          {s.id === viewer.id && (
                            <span className="ml-2 text-[11px] font-normal text-muted-foreground">you</span>
                          )}
                        </div>
                        {s.fullName && s.email && (
                          <div className="max-w-[220px] truncate text-[12px] text-muted-foreground">
                            {s.email}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <RoleForm
                          userId={s.id}
                          role={s.role}
                          blocked={allowed.changeRole}
                          roles={STAFF_ROLES}
                        />
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {formatDepartureDate(s.createdAt)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge value={s.status === 'closed' ? 'closed' : 'active'} />
                        {s.closedAt && (
                          <div className="mt-1 text-[12px] text-muted-foreground">
                            {formatDepartureDate(s.closedAt)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusForm userId={s.id} status={s.status} blocked={allowed.changeStatus} />
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card
            title="Invite somebody"
            description="They get a link to set their own password. Nobody here ever types somebody else's."
          >
            <InviteForm roles={STAFF_ROLES} />
          </Card>

          <Card title="What closing does">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              A closed account cannot sign in to either console, but keeps its role and everything
              it did — the audit trail still names them, and reopening restores access exactly.
              Nothing is deleted, because a booking somebody handled should still say who handled it.
            </p>
          </Card>

          <Card title="Partners are separate">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              A partner cannot be created here. There is one route to that role and it runs through
              an application somebody reviewed, so every partner on the platform has a decision
              behind them.
            </p>
            <Link
              href="/dashboard/partners"
              className="mt-3 inline-block text-[13px] font-medium text-primary hover:underline"
            >
              Partner applications
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
