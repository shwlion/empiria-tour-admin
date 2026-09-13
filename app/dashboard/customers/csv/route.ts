import { requireCapability } from '@/lib/auth';
import { CSV_BOM, customersToCsv, listCustomers } from '@/lib/admin/customers';
import { getSettings } from '@/lib/admin/settings';

export const dynamic = 'force-dynamic';

/**
 * B4's "export to CSV": the directory, filtered as the list was, behind the
 * same capability as the list. A route handler so it downloads from a plain
 * link and so the check is the server's, not the button's.
 */
export async function GET(request: Request) {
  await requireCapability('manageCustomers');
  const q = new URL(request.url).searchParams.get('q') ?? undefined;
  const [rows, settings] = await Promise.all([listCustomers({ q, limit: 5000 }), getSettings()]);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(CSV_BOM + customersToCsv(rows, settings.defaultCurrency), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="customers-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
