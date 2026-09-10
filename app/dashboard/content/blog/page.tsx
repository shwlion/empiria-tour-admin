import type { Metadata } from 'next';
import { listBlogPosts, blogStatusCounts, type BlogStatus } from '@/lib/admin/blog';
import BlogModeration from './BlogModeration';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Blog · Empiria Tour Admin' };

const STATUSES: (BlogStatus | 'all')[] = ['all', 'published', 'draft', 'unpublished'];

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = (STATUSES as string[]).includes(status ?? '')
    ? (status as BlogStatus | 'all')
    : 'all';

  const [posts, counts] = await Promise.all([listBlogPosts(active), blogStatusCounts()]);

  return <BlogModeration posts={posts} counts={counts} active={active} />;
}
