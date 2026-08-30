import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEmailTemplate } from '@/lib/admin/content';
import TemplateForm from './TemplateForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit email · Empiria Tour Admin' };

export default async function EditEmailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const template = await getEmailTemplate(key);
  if (!template) notFound();
  return <TemplateForm template={template} />;
}
