import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getSudogwonDistricts } from '@/lib/report/districts';
import { fetchSudogwonDeals } from '@/lib/report/fetch-deals';
import { detectYearHighs } from '@/lib/report/detect-highs';
import { aggregate } from '@/lib/report/aggregate';
import { generateCommentary } from '@/lib/report/generate-commentary';
import type { DateRange } from '@/lib/report/types';

export const maxDuration = 60;

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getTargetDateRange(): DateRange {
  const now = new Date();
  // KST = UTC + 9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const to = new Date(kst);
  to.setDate(to.getDate() - 1); // 어제

  const from = new Date(kst);
  from.setDate(from.getDate() - 7); // 7일 전

  return { from: formatDate(from), to: formatDate(to) };
}

export async function GET(req: NextRequest) {
  // CRON_SECRET 인증
  const authHeader = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // KV 환경변수 확인 (디버그용)
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return NextResponse.json({
      error: 'KV env vars missing',
      hasUrl: !!process.env.KV_REST_API_URL,
      hasToken: !!process.env.KV_REST_API_TOKEN,
    }, { status: 500 });
  }

  const startTime = Date.now();

  try {
    const apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'PUBLIC_DATA_API_KEY 미설정' },
        { status: 500 },
      );
    }

    const redis = Redis.fromEnv();

    const range = getTargetDateRange();
    const districts = getSudogwonDistricts();

    // 12개월 데이터 수집
    const { deals: allDeals, failedDistricts, totalDistricts } =
      await fetchSudogwonDeals(decodeURIComponent(apiKey), districts, 12);

    // 부분 실패 임계치 (20%) 초과 시 리포트 저장하지 않음
    const failedRatio = totalDistricts > 0 ? failedDistricts / totalDistricts : 0;
    if (failedRatio > 0.2) {
      const errorInfo = {
        timestamp: new Date().toISOString(),
        message: `부분 실패 임계치 초과: ${failedDistricts}/${totalDistricts} (${(failedRatio * 100).toFixed(1)}%)`,
        failedRatio,
        failed: failedDistricts,
        total: totalDistricts,
      };
      await redis.set('report:last_error', errorInfo, { ex: 7 * 24 * 60 * 60 });
      return NextResponse.json(
        { error: errorInfo.message, failedDistricts, totalDistricts },
        { status: 500 },
      );
    }

    // 신고가 감지
    const yearHighs = detectYearHighs(allDeals, range);

    // 집계
    const report = aggregate(allDeals, range, yearHighs);

    // AI 코멘터리 생성
    const commentary = await generateCommentary(report);
    if (commentary) {
      report.commentary = commentary;
    }

    // Redis 저장 (to 날짜 기준 키)
    const dateKey = `report:${range.to.replace(/-/g, '')}`;
    await Promise.all([
      redis.set('report:latest', report),
      redis.set(dateKey, report, { ex: 7 * 24 * 60 * 60 }), // 7일 TTL
    ]);

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      ok: true,
      dateRange: range,
      durationMs,
      districts: districts.length,
      failedDistricts,
      totalDistricts,
      totalDealsFetched: allDeals.length,
      totalTargetDeals: report.summary.totalDeals,
      totalYearHighs: report.summary.totalYearHighs,
      hasCommentary: !!report.commentary,
    });
  } catch (error) {
    console.error('[generate-report] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
