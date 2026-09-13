import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getDestination, listDestinations, destinationStorefrontPath } from '@/lib/admin/destinations';
import { STOREFRONT_URL } from '@/lib/storefront';
import DestinationForm from '../DestinationForm';

export const metadata: Metadata = { title: 'Destination · Empiria Tour Admin' };

export default async function DestinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [destination, all] = await Promise.all([getDestination(id), listDestinations()]);
  if (!destination) notFound();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/content/destinations" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} aria-hidden="true" />
          Destinations
        </Link>
        <p className="text-[12px] text-muted-foreground">
          <span className="font-mono">{destination.path}</span>
          {' · '}{destination.packageCount} {destination.packageCount === 1 ? 'tour' : 'tours'}
          {destination.status === 'published' && (
            <a href={`${STOREFRONT_URL}${destinationStorefrontPath(destination.path)}`} target="_blank" rel="noopener noreferrer" className="ml-3 inline-flex items-center gap-1 hover:text-foreground">
              View on the storefront <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </p>
      </div>
      <DestinationForm destination={destination} all={all} />
    </>
  );
}
