import type { Metadata } from 'next';
import Link from 'next/link';
import { Banner, Table } from '@/components/ui';
import { listEmailTemplates } from '@/lib/admin/content';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Emails · Empiria Tour Admin' };

/**
 * The eleven templates Exhibit A Part C names.
 *
 * All eleven rows exist and every body is empty — the schema shipped the list,
 * nobody has written the words. Nothing sends yet either: Part C is waiting on
 * DNS records for the Resend sending domain. Both facts are said on the page,
 * because a template editor that quietly does nothing is a trap.
 */
export default async function EmailsPage() {
  const templates = await listEmailTemplates();
  const written = templates.filter((t) => !t.isEmpty).length;

  return (
    <div className="flex flex-col gap-5">
      <Banner tone="info">
        <p className="font-medium text-foreground">Nothing sends yet.</p>
        <p className="mt-1">
          Part C needs DNS records for the Resend sending domain before a single email can leave.
          These are the words it will send when it can — {written} of {templates.length} written so far.
        </p>
      </Banner>

      <Table head={['Email', 'Sent when', 'Subject', 'State']}>
        {templates.map((t) => (
          <tr key={t.key} className="transition-colors hover:bg-secondary/50">
            <td className="px-4 py-3">
              <Link
                href={`/dashboard/content/emails/${t.key}`}
                className="font-medium text-foreground transition-colors hover:text-primary"
              >
                {t.name}
              </Link>
              <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{t.key}</div>
            </td>
            <td className="px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">{t.trigger}</td>
            <td className="px-4 py-3 text-[12.5px] text-muted-foreground">
              {t.subject.trim() || <span className="text-destructive">Not written</span>}
            </td>
            <td className="px-4 py-3">
              {t.isEmpty ? (
                <span className="text-[12.5px] font-medium text-destructive">Empty</span>
              ) : t.isActive ? (
                <span className="text-[12.5px] font-medium text-emerald-700">Ready</span>
              ) : (
                <span className="text-[12.5px] text-muted-foreground">Off</span>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
