import { requireCapability } from '@/lib/auth';
import { loadReport, reportToCsv, resolvePeriod, type Report } from '@/lib/admin/reports';

export const dynamic = 'force-dynamic';

/** B5's "all figures exportable": the page's period, every table, and the statement, as one CSV. */
export async function GET(request: Request) {
  await requireCapability('viewFinance');
  const sp = new URL(request.url).searchParams;
  const period = resolvePeriod({ period: sp.get('period') ?? undefined, from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined });
  let report: Report | null;
  try {
    report = await loadReport(period);
  } catch (error) {
    // No file at all rather than one that silently holds part of the period.
    console.error('[reports] csv load failed', error);
    return new Response('The figures could not be read. Try again.', { status: 503 });
  }
  if (!report) return new Response('Not configured', { status: 503 });
  const body = '﻿' + reportToCsv(period, report.currency, report.metrics, report.statement);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="report-${period.fromDate}-to-${period.toDate}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
