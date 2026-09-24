import type { Metadata } from 'next';
import Link from 'next/link';
import { Tag, Users } from 'lucide-react';
import { Button, PageHeader } from '@/components/ui';
import { requireCapability } from '@/lib/auth';
import { getCurrencyCodes, getSettings, settingsGaps } from '@/lib/admin/settings';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings · Empiria Tour Admin' };

/**
 * Administrators only, like the promotions and staff pages beneath it and the
 * Settings tab that links here. An agent has no settings (CLAUDE.md's matrix),
 * and a read-only copy of the form still showed them every value — the hold and
 * payment windows, the postcard rate card, the receipt wording.
 */
export default async function SettingsPage() {
  const user = await requireCapability('manageSettings');
  const [settings, currencies] = await Promise.all([getSettings(), getCurrencyCodes()]);

  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Who Empiria is, how travellers reach them, and what gets added to every price. These values render on the public site — nothing here is internal."
        actions={
          <>
            <Link href="/dashboard/settings/promotions">
              <Button variant="secondary">
                <Tag size={14} aria-hidden="true" />
                Promotion codes
              </Button>
            </Link>
            <Link href="/dashboard/settings/staff">
              <Button variant="secondary">
                <Users size={14} aria-hidden="true" />
                Staff
              </Button>
            </Link>
          </>
        }
      />
      <SettingsForm
        settings={settings}
        currencies={currencies}
        gaps={settingsGaps(settings)}
        canEdit={user.can.manageSettings}
      />
    </>
  );
}
