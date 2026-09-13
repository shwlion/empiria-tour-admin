import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listPackageChoices } from '@/lib/admin/collections';
import { CollectionForm } from '../CollectionForms';

export const metadata: Metadata = { title: 'New collection · Empiria Tour Admin' };

export default async function NewCollectionPage() {
  const packages = await listPackageChoices();
  return (
    <>
      <Link href="/dashboard/content/collections" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} aria-hidden="true" />
        Collections
      </Link>
      <CollectionForm collection={null} packages={packages} />
    </>
  );
}
