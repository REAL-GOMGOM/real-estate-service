import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { getMonthList, fetchTradeMonthAllPages, revalidateForMonth } from '@/lib/molit-months';

/**
 * 실거래 캐시 프리워밍 크론 — Phase 1 속도 개선 (2026-07-13).
 *
 * 문제: /api/transactions 는 국토부 API 실시간 프록시라 첫 조회가 수 초.
 * 해법: 새벽에 인기 지역 × 최근 3개월(기본 조회 기간)의 MOLIT XML 을
 *       미리 페치해 Next Data Cache 에 적재 → 사용자 첫 조회도 캐시 히트.
 *       (근본 해법인 자체 DB 적재는 Phase 2 — 봇 수집분 Neon 동기화)
 *
 * 실행: Vercel Cron 매일 20:00 UTC = 05:00 KST (vercel.json)
 * 인증: CRON_SECRET (fail-closed) — generate-report 와 동일 패턴
 */

export const maxDuration = 60;

// 인기 지역 — 서울 전 25구 + 수도권 조회 상위 (키는 lib/district-codes 와 일치해야 함)
const WARM_DISTRICTS: string[] = [
  // 서울 25구
  '강남구', '서초구', '송파구', '강동구', '마포구', '용산구', '성동구', '광진구',
  '영등포구', '동작구', '관악구', '강서구', '양천구', '구로구', '금천구',
  '종로구', '중구', '성북구', '강북구', '도봉구', '노원구', '동대문구',
  '중랑구', '서대문구', '은평구',
  // 수도권 인기
  '성남시 분당구', '과천시', '하남시', '광명시',
  '수원시 영통구', '용인시 수지구', '고양시 일산동구', '고양시 일산서구',
  '화성시 동탄구', '인천 연수구',
];

const CONCURRENCY = 5;        // 국토부 동시 요청 제한 (예의 + 타임아웃 방지)
const TIME_BUDGET_MS = 50_000; // maxDuration 60s 안에서 안전 마진

export async function GET(req: NextRequest) {
  // CRON_SECRET 인증 (fail-closed: 미설정 시 호출 거부)
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[warm-transactions] CRON_SECRET 미설정 — fail-closed');
    return NextResponse.json(
      { error: 'Server misconfigured: CRON_SECRET missing' },
      { status: 500 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    return NextResponse.json({ error: 'PUBLIC_DATA_API_KEY missing' }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);

  const started = Date.now();
  const months = getMonthList(3); // 기본 조회 기간과 동일

  // (지역 × 월) 작업 목록 — 지역 순서대로 데워서 시간 초과 시 인기 지역부터 보장
  const jobs: Array<{ district: string; lawdCd: string; yyyymm: string }> = [];
  for (const district of WARM_DISTRICTS) {
    const lawdCd = DISTRICT_CODE[district];
    if (!lawdCd) {
      console.warn(`[warm-transactions] 알 수 없는 지역 키: ${district}`);
      continue;
    }
    for (const yyyymm of months) jobs.push({ district, lawdCd, yyyymm });
  }

  let warmed = 0;
  let failed = 0;
  let skipped = 0;

  // 동시성 제한 워커 풀 — 시간 예산 초과 시 남은 작업 스킵
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        skipped = jobs.length - cursor;
        return;
      }
      const job = jobs[cursor++];
      try {
        await fetchTradeMonthAllPages(apiKey, job.lawdCd, job.yyyymm, revalidateForMonth(job.yyyymm));
        warmed++;
      } catch (e) {
        failed++;
        console.warn(`[warm-transactions] 실패 ${job.district} ${job.yyyymm}:`, e instanceof Error ? e.message : e);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const ms = Date.now() - started;
  console.log(`[warm-transactions] 완료 — warmed=${warmed} failed=${failed} skipped=${skipped} ${ms}ms`);
  return NextResponse.json({ warmed, failed, skipped, totalJobs: jobs.length, ms });
}
