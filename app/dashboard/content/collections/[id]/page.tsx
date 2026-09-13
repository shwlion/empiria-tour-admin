import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCollection, listPackageChoices } from '@/lib/admin/collections';
import { CollectionForm } from '../CollectionForms';

export const metadata: Metadata = { title: 'Collection · Empiria Tour Admin' };

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [collection, packages] = await Promise.all([getCollection(id), listPackageChoices()]);
  if (!collection) notFound();
  return (
    <>
      <Link href="/dashboard/content/collections" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} aria-hidden="true" />
        Collections
      </Link>
      <CollectionForm collection={collection} packages={packages} />
    </>
  );
}
