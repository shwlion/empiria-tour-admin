import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getBlogPost, blogLinkOptions } from '@/lib/admin/blog';
import BlogEditor from '../BlogEditor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit post · Empiria Tour Admin' };

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [post, options] = await Promise.all([getBlogPost(id), blogLinkOptions()]);
  if (!post) notFound();
  return <BlogEditor post={post} options={options} />;
}
