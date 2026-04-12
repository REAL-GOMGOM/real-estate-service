import type { DateRange, Deal, YearHigh, RegionStats, Report, Sido } from './types';

const MIN_PRICE = 100_000_000; // 1억 원
const NOTABLE_THRESHOLD = 0.3;

const DISCLAIMER =
  '본 리포트는 국토부 실거래가 공개시스템에 신고 완료된 거래만 포함합니다. ' +
  '실거래 계약 후 신고까지 최대 30일이 소요되므로 실제 시장 거래량과 차이가 있을 수 있습니다. ' +
  '투자 판단의 참고 정보로만 활용하시기 바랍니다.';

function dealDate(d: Deal): string {
  return `${d.dealYear}-${d.dealMonth}-${d.dealDay}`;
}

function formatMD(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

export function aggregate(
  deals: Deal[],
  range: DateRange,
  yearHighs: YearHigh[],
): Report {
  const targetDeals = deals.filter((d) => {
    const dd = dealDate(d);
    return dd >= range.from && dd <= range.to && d.dealAmount >= MIN_PRICE;
  });

  const sidos: Sido[] = ['서울', '경기', '인천'];

  const byRegion: RegionStats[] = sidos.map((sido) => {
    const sidoDeals = targetDeals.filter((d) => d.sido === sido);
    const sidoHighs = yearHighs.filter((h) => h.sido === sido);
    const totalAmount = sidoDeals.reduce((s, d) => s + d.dealAmount, 0);

    return {
      sido,
      deals: sidoDeals.length,
      yearHighs: sidoHighs.length,
      avgPrice: sidoDeals.length > 0 ? Math.round(totalAmount / sidoDeals.length) : 0,
      totalAmount,
    };
  });

  const sorted = [...yearHighs].sort((a, b) => b.increase - a.increase);
  const notableDeals = sorted.filter((h) => h.increase >= NOTABLE_THRESHOLD).slice(0, 5);
  const topYearHighs = sorted.filter((h) => h.increase < NOTABLE_THRESHOLD).slice(0, 20);

  const totalAmount = targetDeals.reduce((s, d) => s + d.dealAmount, 0);

  // KST 오늘 날짜로 title 생성
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const titleY = kst.getFullYear();
  const titleM = kst.getMonth() + 1;
  const titleD = kst.getDate();

  return {
    generatedAt: new Date().toISOString(),
    title: `${titleY}년 ${titleM}월 ${titleD}일 기준 수도권 아파트 실거래 리포트`,
    subtitle: `최근 30일 국토부 신고 거래 기준 (${formatMD(range.from)} ~ ${formatMD(range.to)})`,
    dateRange: range,
    range: 'sudogwon',
    summary: {
      totalDeals: targetDeals.length,
      totalYearHighs: yearHighs.length,
      totalAmount,
      avgPrice: targetDeals.length > 0 ? Math.round(totalAmount / targetDeals.length) : 0,
    },
    byRegion,
    topYearHighs,
    notableDeals,
    notableThreshold: NOTABLE_THRESHOLD,
    disclaimer: DISCLAIMER,
  };
}
