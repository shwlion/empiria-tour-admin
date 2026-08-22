import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getPackage } from '@/lib/admin/packages';
import ItineraryForm from './ItineraryForm';

export const dynamic = 'force-dynamic';

export default async function ItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();
  const detail = await getPackage(id, user.can.scopedToOwnPackages ? user.id : null);
  if (!detail) notFound();

  return (
    <ItineraryForm
      packageId={detail.pkg.id}
      itinerary={detail.itinerary}
      inclusions={detail.inclusions}
    />
  );
}
