import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { fieldReportStore } from './repository';

/** Cache only the public DTO, never drafts or moderation data. Admin mutations
 * immediately invalidate this tag. Browsers themselves still use no-store. */
export async function readPublishedFieldReports() {
  'use cache';
  cacheLife({ stale: 0, revalidate: 30, expire: 60 });
  cacheTag('field-reports-public');
  return fieldReportStore().listPublic();
}
