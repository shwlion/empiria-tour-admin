import type { Metadata } from 'next';
import { listDisclosureBlocks } from '@/lib/admin/content';
import DisclosureEditor from './DisclosureEditor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Disclosures · Empiria Tour Admin' };

export default async function DisclosuresPage() {
  const blocks = await listDisclosureBlocks();
  return <DisclosureEditor blocks={blocks} />;
}
