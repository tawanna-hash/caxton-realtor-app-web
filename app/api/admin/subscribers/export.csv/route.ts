/**
 * /api/admin/subscribers/export.csv  GET — full CSV download, audit-logged.
 *
 * `export.csv` is a literal path segment (Next.js allows dots in segment
 * names). No pagination; all rows; all columns.
 */

import { NextResponse } from 'next/server';
import { requireAdmin, getRequestIp } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import {
  EXPORT_COLUMNS,
  csvEscape,
  listAllSubscribersForExport,
} from '@/lib/server/subscribers-store';
import { logAudit } from '@/lib/server/audit';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

export const GET = withAdminTracking(async () => {
  const admin = await requireAdmin();
  const rows = await listAllSubscribersForExport();

  const header = EXPORT_COLUMNS.join(',');
  const body = rows
    .map((r) => EXPORT_COLUMNS.map((c) => csvEscape((r as Record<string, unknown>)[c])).join(','))
    .join('\n');
  const csv = `${header}\n${body}\n`;

  const filename = `caxton_subscribers_${new Date().toISOString().slice(0, 10)}.csv`;

  // Fire-and-forget audit log — must not delay or fail the response.
  void (async () => {
    try {
      await logAudit({
        adminId: admin.adminId,
        action: 'subscribers.export',
        entityType: 'subscribers',
        entityId: null,
        afterState: { row_count: rows.length, filename },
        ipAddress: await getRequestIp(),
      });
    } catch (err) {
      logger.warn({ err }, 'subscribers export audit log failed');
    }
  })();

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
