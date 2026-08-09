import { NextRequest } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { getExchangeRateQuotes } from '@/lib/exchange-rate';
import {
  fetchDollarLiveRates,
  fetchDollarYearDeals,
  parseDollarQuery,
  selectDollarAssets,
} from '@/lib/dollar-api';
import { availableAreas, averagePrice, filterByArea } from '@/lib/dollar-shared';
import { kstTodayIso } from '@/lib/agg-window';

export async function GET(req: NextRequest) {
  const now = new Date();
  const parsed = parseDollarQuery(req.nextUrl.searchParams, now);
  if (!parsed.ok) {
    return Response.json({ status: 'invalid_request', error: parsed.error }, { status: 400 });
  }

  const { district, aptName, baseYear, compareYear, area } = parsed.value;
  const lawdCd = DISTRICT_CODE[district];
  if (!lawdCd) {
    return Response.json(
      { status: 'invalid_request', error: `지원하지 않는 지역입니다: ${district}` },
      { status: 400 },
    );
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[dollar API] PUBLIC_DATA_API_KEY 환경변수 미설정');
    return Response.json(
      {
        status: 'degraded',
        error: '국토교통부 실거래가 연결 설정이 없어 현재 조회할 수 없습니다.',
      },
      { status: 503 },
    );
  }

  let apiKey: string;
  try {
    apiKey = decodeURIComponent(rawKey);
  } catch {
    console.error('[dollar API] PUBLIC_DATA_API_KEY 형식 오류');
    return Response.json(
      { status: 'degraded', error: '국토교통부 실거래가 연결 설정을 확인해 주세요.' },
      { status: 503 },
    );
  }

  const currentYear = Number(kstTodayIso(now).slice(0, 4));
  try {
    const [baseResult, compareResult, exchangeResult, liveResult] = await Promise.all([
      fetchDollarYearDeals(lawdCd, baseYear, aptName, apiKey, now),
      fetchDollarYearDeals(lawdCd, compareYear, aptName, apiKey, now),
      getExchangeRateQuotes([baseYear, compareYear]),
      baseYear === currentYear || compareYear === currentYear
        ? fetchDollarLiveRates()
        : Promise.resolve(null),
    ]);

    if (!baseResult.hasUsableResponse || !compareResult.hasUsableResponse) {
      return Response.json(
        {
          status: 'degraded',
          error: '국토교통부 원본 응답을 확인할 수 없어 거래가 0건인지 판별하지 못했습니다.',
          coverage: {
            base: baseResult.window,
            compare: compareResult.window,
          },
        },
        { status: 502 },
      );
    }

    const areaMap = new Map<number, { count: number; baseCount: number }>();
    for (const { area: itemArea, count } of availableAreas(compareResult.deals)) {
      areaMap.set(itemArea, { count, baseCount: 0 });
    }
    for (const { area: itemArea, count } of availableAreas(baseResult.deals)) {
      const existing = areaMap.get(itemArea);
      if (existing) existing.baseCount = count;
      else areaMap.set(itemArea, { count: 0, baseCount: count });
    }
    const areas = [...areaMap.entries()]
      .map(([itemArea, counts]) => ({ area: itemArea, ...counts }))
      .sort((a, b) => a.area - b.area);

    const basePrices = filterByArea(baseResult.deals, area);
    const comparePrices = filterByArea(compareResult.deals, area);
    const baseAssets = selectDollarAssets(
      baseYear,
      currentYear,
      exchangeResult.quotes[baseYear],
      liveResult,
    );
    const compareAssets = selectDollarAssets(
      compareYear,
      currentYear,
      exchangeResult.quotes[compareYear],
      liveResult,
    );

    const warnings = new Set<string>();
    if (baseResult.window.failedMonths.length > 0 || compareResult.window.failedMonths.length > 0) {
      warnings.add('일부 조회 월의 국토교통부 응답이 실패해 남은 월 표본만 계산했습니다.');
    }
    if (baseResult.window.fallbackUsed || compareResult.window.fallbackUsed) {
      warnings.add('기본 조회 기간에 일치 거래가 없어 해당 연도의 다른 월까지 조회 범위를 넓혔습니다.');
    }
    if (exchangeResult.warning) warnings.add(exchangeResult.warning);
    if (liveResult && !liveResult.ok) {
      warnings.add(`현재 시세 조회 실패: ${liveResult.error} 정적 참고 추정치로 표시했습니다.`);
    }

    const allProvenance = [
      baseAssets.provenance.exchangeRate,
      compareAssets.provenance.exchangeRate,
      baseAssets.provenance.bitcoin,
      compareAssets.provenance.bitcoin,
      baseAssets.provenance.gold,
      compareAssets.provenance.gold,
    ];
    if (allProvenance.some((item) => item.mode === 'static_estimate')) {
      warnings.add('정적 참고 추정치는 원자료 기준일과 산출 근거가 검증되지 않아 방향성 참고에만 적합합니다.');
    }
    if (allProvenance.some((item) => item.mode === 'unavailable')) {
      warnings.add('일부 환산 자산의 값을 확인할 수 없어 해당 항목을 표시하지 않았습니다.');
    }
    if (
      allProvenance.some((item) => item.mode === 'live_proxy')
      && allProvenance.some((item) => item.mode === 'static_estimate')
    ) {
      warnings.add('현재 시점 호가와 과거 정적 추정치는 기준 시점·산식이 달라 엄밀한 수익률 비교가 아닙니다.');
    }

    const warningList = [...warnings];
    return Response.json({
      status: warningList.length > 0 ? 'partial' : 'ok',
      aptName,
      district,
      baseYear,
      compareYear,
      basePriceKrw: averagePrice(basePrices),
      comparePriceKrw: averagePrice(comparePrices),
      baseExchangeRate: baseAssets.exchangeRate,
      compareExchangeRate: compareAssets.exchangeRate,
      baseBtcKrw: baseAssets.btcKrw,
      compareBtcKrw: compareAssets.btcKrw,
      baseGoldKrwPerGram: baseAssets.goldKrwPerGram,
      compareGoldKrwPerGram: compareAssets.goldKrwPerGram,
      area,
      availableAreas: areas,
      baseIsYtd: baseYear === currentYear,
      compareIsYtd: compareYear === currentYear,
      warnings: warningList,
      provenance: {
        transactions: {
          source: '국토교통부 아파트매매 실거래자료',
          matchMethod: '공백 제거 후 단지명 부분 일치',
          cancellationExcluded: true,
          aggregation: '선택 면적의 유효 거래금액 산술평균',
          base: {
            ...baseResult.window,
            sampleCount: basePrices.length,
            allAreaSampleCount: baseResult.deals.length,
          },
          compare: {
            ...compareResult.window,
            sampleCount: comparePrices.length,
            allAreaSampleCount: compareResult.deals.length,
          },
        },
        exchangeRate: {
          base: baseAssets.provenance.exchangeRate,
          compare: compareAssets.provenance.exchangeRate,
        },
        bitcoin: {
          base: baseAssets.provenance.bitcoin,
          compare: compareAssets.provenance.bitcoin,
        },
        gold: {
          base: baseAssets.provenance.gold,
          compare: compareAssets.provenance.gold,
        },
      },
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
    });
  } catch (error) {
    console.error('[dollar API] 조회 실패', error instanceof Error ? error.message : 'unknown error');
    return Response.json(
      { status: 'degraded', error: '원본 거래자료 또는 환산 기준을 불러오지 못했습니다.' },
      { status: 502 },
    );
  }
}
