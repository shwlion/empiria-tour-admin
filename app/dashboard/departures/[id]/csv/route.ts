import { requireCapability } from '@/lib/auth';
import { getManifest, manifestToCsv } from '@/lib/admin/manifests';

export const dynamic = 'force-dynamic';

/**
 * The manifest as CSV — B3's export, one row per traveller.
 *
 * A route handler rather than a client-side blob so the download works from a
 * plain link, and so the same capability check guards it as guards the page:
 * this file holds names, dates of birth and emergency contacts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireCapability('manageBookings');
  const { id } = await params;
  const manifest = await getManifest(id, user.can.scopedToOwnPackages ? user.id : null);
  if (!manifest) return new Response('Not found', { status: 404 });

  const filename = `manifest-${manifest.packageSlug}-${manifest.startsOn}.csv`;
  return new Response(manifestToCsv(manifest), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
