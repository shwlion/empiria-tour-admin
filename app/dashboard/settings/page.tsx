import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { requireStaff } from '@/lib/auth';
import { getCurrencyCodes, getSettings, settingsGaps } from '@/lib/admin/settings';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings · Empiria Tour Admin' };

export default async function SettingsPage() {
  const user = await requireStaff();
  const [settings, currencies] = await Promise.all([getSettings(), getCurrencyCodes()]);

  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Who Empiria is, how travellers reach them, and what gets added to every price. These values render on the public site — nothing here is internal."
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
