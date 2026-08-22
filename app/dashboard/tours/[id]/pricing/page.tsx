import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getPackage, getPackageOptions } from '@/lib/admin/packages';
import PricingForm from './PricingForm';

export const dynamic = 'force-dynamic';

export default async function PricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();
  const [detail, options] = await Promise.all([
    getPackage(id, user.can.scopedToOwnPackages ? user.id : null),
    getPackageOptions(),
  ]);
  if (!detail) notFound();

  return (
    <PricingForm
      pkg={detail.pkg}
      prices={detail.prices}
      currencies={options.currencies}
      policies={options.policies}
      canEdit={user.can.setPricing}
    />
  );
}
