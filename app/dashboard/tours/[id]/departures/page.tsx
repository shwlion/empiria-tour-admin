import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getPackage } from '@/lib/admin/packages';
import { listDeparturesForPackage } from '@/lib/admin/departures';
import DeparturesForm from './DeparturesForm';

export const dynamic = 'force-dynamic';

export default async function DeparturesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();
  const detail = await getPackage(id, user.can.scopedToOwnPackages ? user.id : null);
  if (!detail) notFound();

  const departures = await listDeparturesForPackage(id);
  const typical = departures.length
    ? Math.round(departures.reduce((n, d) => n + d.capacity, 0) / departures.length)
    : 12;

  return (
    <DeparturesForm
      packageId={detail.pkg.id}
      departures={departures}
      currency={detail.pkg.currency}
      defaultCapacity={typical}
    />
  );
}
