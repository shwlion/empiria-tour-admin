import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getPackage } from '@/lib/admin/packages';
import OptionsForm from './OptionsForm';

export const dynamic = 'force-dynamic';

export default async function OptionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();
  const detail = await getPackage(id, user.can.scopedToOwnPackages ? user.id : null);
  if (!detail) notFound();

  return (
    <OptionsForm
      packageId={detail.pkg.id}
      rooms={detail.rooms}
      extras={detail.extras}
      customFields={detail.customFields}
      currency={detail.pkg.currency}
      canEdit={user.can.setPricing}
    />
  );
}
