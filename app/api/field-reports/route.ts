import { NextResponse } from 'next/server';
import { connection } from 'next/server';
import { fieldReportConfig } from '@/lib/field-reports/config';
import { readPublishedFieldReports } from '@/lib/field-reports/public-feed';
import { FIELD_REPORT_PUBLIC_DAYS, type FieldReportFeed } from '@/lib/field-reports/types';

export async function GET() {
  await connection();
  const config = fieldReportConfig();
  let result: FieldReportFeed;
  try {
    if (!config.configured) {
      result = { status: 'preparing', submissionsEnabled: false, reports: [] };
    } else {
      const reports = await readPublishedFieldReports();
      // Even a still-cached DTO must not extend the public display period.
      const now = Date.now();
      result = { status: 'ok', submissionsEnabled: config.submissionsEnabled, reports: reports.filter((report) => Date.parse(report.createdAt) + FIELD_REPORT_PUBLIC_DAYS * 86_400_000 > now) };
    }
  } catch {
    result = { status: 'unavailable', submissionsEnabled: false, reports: [], message: '현장 제보가격을 잠시 불러올 수 없습니다. 공식 실거래 조회는 계속 이용할 수 있습니다.' };
  }
  return NextResponse.json(result, {
    status: result.status === 'unavailable' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store', 'X-Naezip-Data-Source': 'user-field-reports' },
  });
}
