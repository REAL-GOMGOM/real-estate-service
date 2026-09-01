import 'server-only';
import { createFieldReportRedis, fieldReportConfig } from './config';
import { createFieldReportStore } from './store';
export function fieldReportStore() {
  return createFieldReportStore(createFieldReportRedis(), fieldReportConfig().prefix);
}
// These server-only methods must only be called after admin authorization.
export async function listFieldReportsForAdmin() { return fieldReportStore().listAdmin(); }
export async function moderateFieldReport(id: string, status: 'published' | 'rejected' | 'hidden') {
  return fieldReportStore().moderate(id, status);
}
