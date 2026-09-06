import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { matchesQuery } from '@/lib/search-utils';
import { getMonthList, fetchSilvMonthAllPages, revalidateForMonth } from '@/lib/molit-months';
import { fetchWebMolitMonths } from '@/lib/molit-web-query';
import { MolitRequestStoppedError, throwIfMolitAborted } from '@/lib/molit-request-control';
import { parseSilvXml, groupSilvTransactions } from '@/lib/silv-shared';
import { createPublicSnapshotRuntimeFromEnv, isPublicSnapshotConfigured } from '@/lib/public-snapshots/runtime';
import { buildPresaleResponseFromSnapshot, type ApartmentIndexItem } from '@/lib/public-snapshots/serving-artifacts';
import { matchesApartmentIdentity } from '@/lib/transaction-identity';
import { resolveTransactionApartmentSelection } from '@/lib/transaction-apartment-selection';

/**
 * 분양권 실거래 API — 분양권 탭.
 *
 * GET /api/transactions/silv?district=강남구&months=3&aptId=&aptName=&aptDong=&limit=
 * 매매(/api/transactions)·전월세와 동일한 응답 골격 { data, district, months, total }.
 * MOLIT 부하: 매매와 같은 월·구 단위 fetch 캐시(24h) 사용.
 */

const APT_NAME_MAX_LEN = 50;
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const { searchParams } = req.nextUrl;
  let district = searchParams.get('district')?.trim() || '강남구';
  const parsedMonths = parseInt(searchParams.get('months') ?? '3', 10);
  const months   = Number.isFinite(parsedMonths)
    ? Math.min(Math.max(parsedMonths, 1), 36)
    : 3;
  const aptName  = (searchParams.get('aptName') ?? searchParams.get('q') ?? '').trim().slice(0, APT_NAME_MAX_LEN);
  const aptId = (searchParams.get('aptId') ?? '').trim().slice(0, 200);
  const aptDong = (searchParams.get('aptDong') ?? '').replace(/\s+/g, '').slice(0, 100);
  const limit    = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '60') || 60, 1), 100);

  let lawdCd = DISTRICT_CODE[district];
  if (!aptId && !lawdCd) {
    return NextResponse.json({ error: '지원하지 않는 구: ' + district }, { status: 400 });
  }
  const servingMode = isPublicSnapshotConfigured();
  const runtime = createPublicSnapshotRuntimeFromEnv();
  let selectedApartment: ApartmentIndexItem | null = null;
  if (aptId) {
    const selection = await resolveTransactionApartmentSelection({ aptId, runtime, allowDbFallback: !servingMode });
    if (!selection.ok) {
      return NextResponse.json({ error: selection.error }, {
        status: selection.status, headers: { 'Cache-Control': 'no-store' },
      });
    }
    selectedApartment = selection.apartment;
    lawdCd = selection.apartment.lawdCd;
    district = selection.district;
  }

  // 공개 스냅샷 hit는 API key 확인보다 먼저 처리한다. 이렇게 해야
  // 공공 API 장애·한도 중에도 직전 검증본을 계속 제공할 수 있다.
  try {
    const snapshot = await runtime.getDistrictSnapshot(lawdCd);
    if (req.signal.aborted) return NextResponse.json({ error: '분양권 조회가 취소되었습니다' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
    if (snapshot.status === 'success' && snapshot.data.partition.lawdCd === lawdCd) {
      const served = buildPresaleResponseFromSnapshot(snapshot.data, {
        months, limit, aptName, aptDong,
        ...(selectedApartment ? { aptId: selectedApartment.id, apartmentIndex: [selectedApartment] } : {}),
      });
      if (served.hit) {
        return NextResponse.json(served.body, {
          headers: {
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
            'X-Naezip-Data-Source': 'snapshot',
            'X-Naezip-Snapshot-Generated-At': snapshot.data.generatedAt,
          },
        });
      }
    }
  } catch {
    // 스냅샷 변환 실패는 기존 공공 API 조회를 막지 않는다.
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[transactions/silv API] PUBLIC_DATA_API_KEY 미설정');
    return NextResponse.json({ error: '분양권 데이터를 불러올 수 없습니다' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
  const apiKey = decodeURIComponent(rawKey);

  try {
    throwIfMolitAborted(req.signal);
    const monthList = getMonthList(months);
    const settled = await fetchWebMolitMonths(
      monthList,
      (yyyymm, options) => fetchSilvMonthAllPages(apiKey, lawdCd, yyyymm, revalidateForMonth(yyyymm), options),
      { signal: req.signal, startedAt, allowPartial: true },
    );
    throwIfMolitAborted(req.signal);
    const failedMonths = monthList.filter((_, index) => settled[index].status === 'rejected');
    const xmls = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (xmls.length === 0) throw new Error('all presale month requests failed');

    const transactions = xmls.flatMap((xml) => parseSilvXml(xml, district))
      .filter((transaction) => selectedApartment
        ? matchesApartmentIdentity(transaction, selectedApartment)
        : !aptDong || (transaction.dong ?? '').replace(/\s+/g, '') === aptDong);

    const matchingGroups = groupSilvTransactions(transactions)
      .filter((g) => Boolean(selectedApartment) || !aptName || matchesQuery(g.name, aptName));
    const total = matchingGroups.reduce((sum, group) => sum + group.transactions.length, 0);
    const result = matchingGroups
      .map((g) => {
        g.transactions.sort((a, b) => b.date.localeCompare(a.date));
        g.areas.sort((a, b) => a - b);
        return g;
      })
      .sort((a, b) => b.transactions.length - a.transactions.length)
      .slice(0, !selectedApartment && aptName ? 100 : limit)
      // 단지 조회는 이전 공유 계약을 보존하고, 일반 지역 목록만 축약한다.
      .map((g) => ({
        ...g,
        ...(selectedApartment ? { masterId: selectedApartment.id } : {}),
        txCount: g.transactions.length,
        transactions: selectedApartment || aptName || aptDong ? g.transactions : g.transactions.slice(0, 10),
      }));

    const isPartial = failedMonths.length > 0;
    return NextResponse.json(
      {
        data: result,
        district,
        months,
        total,
        ...(selectedApartment ? { selectedAptId: selectedApartment.id } : {}),
        status: isPartial ? 'partial' : 'ok',
        ...(isPartial ? { failedMonths } : {}),
      },
      { headers: { 'Cache-Control': isPartial ? 'no-store' : 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('[transactions/silv API] 조회 실패:', error);
    return NextResponse.json({ error: '분양권 조회 실패' }, {
      status: servingMode || error instanceof MolitRequestStoppedError ? 503 : 500, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
