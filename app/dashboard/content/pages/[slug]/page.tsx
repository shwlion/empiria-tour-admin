import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStaticPage, REQUIRED_PAGES } from '@/lib/admin/content';
import PageForm from './PageForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit page · Empiria Tour Admin' };

export default async function EditStaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const required = REQUIRED_PAGES.find((r) => r.slug === slug);
  const page = await getStaticPage(slug);

  // A slug that is neither one of the four nor an existing row is somebody
  // typing a URL, not a page.
  if (!required && !page) notFound();

  return (
    <PageForm
      slug={slug}
      page={page}
      route={required?.route ?? null}
      why={required?.why ?? null}
      fallbackTitle={required?.title ?? slug}
    />
  );
}
