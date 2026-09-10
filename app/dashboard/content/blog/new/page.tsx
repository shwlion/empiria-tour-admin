import type { Metadata } from 'next';
import { blogLinkOptions } from '@/lib/admin/blog';
import BlogEditor from '../BlogEditor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New post · Empiria Tour Admin' };

export default async function NewBlogPostPage() {
  return <BlogEditor post={null} options={await blogLinkOptions()} />;
}
