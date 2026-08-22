import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { requireCapability } from '@/lib/auth';
import { getPackageOptions } from '@/lib/admin/packages';
import NewTourForm from './NewTourForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New tour · Empiria Tour Admin' };

export default async function NewTourPage() {
  await requireCapability('managePackages');
  const { destinations, categories, currencies } = await getPackageOptions();

  return (
    <>
      <PageHeader title="New tour" description="Creates a draft. Nothing is public until you publish it." />
      <NewTourForm destinations={destinations} categories={categories} currencies={currencies} />
    </>
  );
}
