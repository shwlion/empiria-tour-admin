import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import { Badge, Card, Table } from '@/components/ui';
import { listStaticPages, REQUIRED_PAGES } from '@/lib/admin/content';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pages · Empiria Tour Admin' };

/**
 * The four policy pages, and anything else somebody has created.
 *
 * Only the four have routes on the storefront, so they are listed first and by
 * name — a page with no route is a page nobody can read, and there is no
 * "create" button here for exactly that reason.
 */
export default async function ContentPagesPage() {
  const pages = await listStaticPages();
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const extras = pages.filter((p) => !REQUIRED_PAGES.some((r) => r.slug === p.slug));

  return (
    <div className="flex flex-col gap-5">
      <Table head={['Page', 'Address', 'State', 'Last edited']}>
        {REQUIRED_PAGES.map((required) => {
          const page = bySlug.get(required.slug);
          const placeholder = page != null && page.body.trim().length < 200;
          return (
            <tr key={required.slug} className="transition-colors hover:bg-secondary/50">
              <td className="px-4 py-3">
                <Link
                  href={`/dashboard/content/pages/${required.slug}`}
                  className="font-medium text-foreground transition-colors hover:text-primary"
                >
                  {page?.title ?? required.title}
                </Link>
                <div className="mt-0.5 text-[12px] text-muted-foreground">{required.why}</div>
              </td>
              <td className="px-4 py-3">
                <span className="font-mono text-[12px] text-muted-foreground">{required.route}</span>
              </td>
              <td className="px-4 py-3">
                {!page ? (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-destructive">
                    <TriangleAlert size={13} aria-hidden="true" />
                    Missing — the page 404s
                  </span>
                ) : placeholder ? (
                  <Badge value="draft" />
                ) : (
                  <Badge value="published" />
                )}
              </td>
              <td className="px-4 py-3 text-[12px] text-muted-foreground">
                {page ? new Date(page.updatedAt).toLocaleDateString('en-CA') : '—'}
              </td>
            </tr>
          );
        })}
      </Table>

      {extras.length > 0 && (
        <Card
          title="Other pages"
          description="These exist in the database but the storefront has no route for them, so nobody can reach them."
        >
          <ul className="flex flex-col gap-1.5">
            {extras.map((p) => (
              <li key={p.slug} className="text-[13px]">
                <Link
                  href={`/dashboard/content/pages/${p.slug}`}
                  className="text-foreground transition-colors hover:text-primary"
                >
                  {p.title}
                </Link>
                <span className="ml-2 font-mono text-[12px] text-muted-foreground">{p.slug}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
        <ExternalLink size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Adding a new public page needs a route building alongside it, so there is no create
          button here. Ask for one and it takes a few minutes.
        </span>
      </p>
    </div>
  );
}
