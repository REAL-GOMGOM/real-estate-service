import 'server-only';

import { isFieldReportAdmin } from '@/lib/field-reports/admin-auth';
import { listFieldReportsForAdmin } from '@/lib/field-reports/repository';
import type { AdminFieldReport } from '@/lib/field-reports/types';

export type AdminFieldReportsResult =
  | { status: 'forbidden' }
  | { status: 'unavailable' }
  | { status: 'ready'; reports: AdminFieldReport[]; checkedAt: number };

/** Private, uncached read: authorize here even when the parent layout has checked. */
export async function getAdminFieldReports(): Promise<AdminFieldReportsResult> {
  if (!(await isFieldReportAdmin())) return { status: 'forbidden' };

  try {
    const reports = await listFieldReportsForAdmin();
    return { status: 'ready', reports: reports.slice(0, 100), checkedAt: Date.now() };
  } catch {
    // Never serialize database errors, connection strings, or submitted content.
    return { status: 'unavailable' };
  }
}
