import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getPackage, getPackageOptions } from '@/lib/admin/packages';
import BasicsForm from './BasicsForm';

export const dynamic = 'force-dynamic';

export default async function TourBasicsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();
  const [detail, options] = await Promise.all([
    getPackage(id, user.can.scopedToOwnPackages ? user.id : null),
    getPackageOptions(),
  ]);
  if (!detail) notFound();

  return (
    <BasicsForm
      pkg={detail.pkg}
      destinations={options.destinations}
      categories={options.categories}
    />
  );
}
