import type { Metadata } from 'next';
import { listShowcaseCards } from '@/lib/admin/content';
import ShowcaseEditor from './ShowcaseEditor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Showcase · Empiria Tour Admin' };

export default async function ShowcasePage() {
  const cards = await listShowcaseCards();
  return <ShowcaseEditor cards={cards} />;
}
