import { describe, it, expect } from 'vitest';
import {
  parseRentXml, groupRentTransactions, isJeonse, fmtRentPrice, sortRentGroups,
  buildRentShareCard, rentSparkPts,
  type RentTransaction, type RentAptGroup,
} from '../rent-shared';
import { fmtPrice } from '../tx-shared';

/** 사이클 II — 전월세 파서 단위 테스트 */

function item(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('');
  return `<item>${body}</item>`;
}

const BASE = {
  aptNm: '래미안', excluUseAr: '84.97', floor: '12',
  dealYear: '2026', dealMonth: '6', dealDay: '15',
  umdNm: '대치동', buildYear: '2015',
};

describe('parseRentXml', () => {
  it('전세 — 보증금 콤마 파싱, 월세 0', () => {
    const xml = item({ ...BASE, deposit: '150,000', monthlyRent: '0' });
    const [tx] = parseRentXml(xml, '강남구');
    expect(tx.deposit).toBe(150000);
    expect(tx.monthlyRent).toBe(0);
    expect(isJeonse(tx)).toBe(true);
    expect(tx.area).toBe(85);
    expect(tx.date).toBe('2026-06-15');
  });

  it('월세 — 보증금/월세 분리', () => {
    const xml = item({ ...BASE, deposit: '10,000', monthlyRent: '120' });
    const [tx] = parseRentXml(xml, '강남구');
    expect(tx.deposit).toBe(10000);
    expect(tx.monthlyRent).toBe(120);
    expect(isJeonse(tx)).toBe(false);
  });

  it('갱신 계약 — 종전 보증금·월세 보존, 신규는 null', () => {
    const renewed = item({
      ...BASE, deposit: '160,000', monthlyRent: '0',
      contractType: '갱신', preDeposit: '150,000', preMonthlyRent: '0',
    });
    const fresh = item({ ...BASE, aptNm: '신규단지', deposit: '90,000', monthlyRent: '0', contractType: '신규' });
    const txs = parseRentXml(renewed + fresh, '강남구');
    expect(txs[0].contractType).toBe('갱신');
    expect(txs[0].prevDeposit).toBe(150000);
    expect(txs[0].prevMonthlyRent).toBeNull();  // 0 → null (전세 갱신)
    expect(txs[1].prevDeposit).toBeNull();
  });

  it('필수 필드 누락·보증금 0 행은 제외', () => {
    const noName    = item({ ...BASE, aptNm: '', deposit: '50,000', monthlyRent: '0' });
    const noDeposit = item({ ...BASE, deposit: '0', monthlyRent: '100' });
    const ok        = item({ ...BASE, deposit: '50,000', monthlyRent: '0' });
    expect(parseRentXml(noName + noDeposit + ok, '강남구')).toHaveLength(1);
  });
});

describe('groupRentTransactions', () => {
  it('단지별 그룹핑 — 면적 목록·건축년도 채움', () => {
    const xml =
      item({ ...BASE, deposit: '150,000', monthlyRent: '0' }) +
      item({ ...BASE, excluUseAr: '59.9', deposit: '100,000', monthlyRent: '0' }) +
      item({ ...BASE, aptNm: '개포자이', deposit: '80,000', monthlyRent: '0' });
    const groups = groupRentTransactions(parseRentXml(xml, '강남구'));
    expect(groups).toHaveLength(2);
    const raemian = groups.find((g) => g.name === '래미안')!;
    expect(raemian.transactions).toHaveLength(2);
    expect(raemian.areas.sort((a, b) => a - b)).toEqual([60, 85]);
    expect(raemian.buildYear).toBe(2015);
  });
});

describe('fmtRentPrice', () => {
  const tx = (deposit: number, monthlyRent: number) =>
    ({ deposit, monthlyRent }) as Pick<RentTransaction, 'deposit' | 'monthlyRent'>;

  it('전세는 보증금만, 월세는 보증금/월세', () => {
    expect(fmtRentPrice(tx(150000, 0), fmtPrice)).toBe('15억');
    expect(fmtRentPrice(tx(10000, 120), fmtPrice)).toBe('1억/120만');
  });
});

describe('sortRentGroups (전월세 v2 — 월세 정렬)', () => {
  const group = (name: string, over: Partial<RentAptGroup> = {}): RentAptGroup => ({
    id: name, name, district: '강남구', dong: null, buildYear: null,
    areas: [84], transactions: [], ...over,
  });
  const tx = (deposit: number, monthlyRent: number, date: string): RentTransaction => ({
    aptName: 'X', district: '강남구', dong: '', area: 84, floor: 1,
    deposit, monthlyRent, date, buildYear: null, contractType: '',
    prevDeposit: null, prevMonthlyRent: null,
  });

  it('volume — txCount 우선, 없으면 거래 수 폴백', () => {
    const a = group('A', { txCount: 30, transactions: [tx(1, 0, '2026-06-01')] });
    const b = group('B', { transactions: [tx(1, 0, '2026-06-01'), tx(1, 0, '2026-06-02')] });
    expect(sortRentGroups([b, a], 'volume').map((g) => g.name)).toEqual(['A', 'B']);
  });

  it('date — 최근 계약일 내림차순 (거래 순서 무관)', () => {
    const a = group('A', { transactions: [tx(1, 0, '2026-05-01'), tx(1, 0, '2026-07-01')] });
    const b = group('B', { transactions: [tx(1, 0, '2026-06-15')] });
    expect(sortRentGroups([b, a], 'date').map((g) => g.name)).toEqual(['A', 'B']);
  });

  it('deposit — 서버 집계값 우선, 없으면 보이는 거래 최고 보증금 폴백', () => {
    const a = group('A', { maxDeposit: 200000, transactions: [tx(50000, 0, '2026-06-01')] });
    const b = group('B', { transactions: [tx(150000, 0, '2026-06-01')] });
    const c = group('C', { transactions: [tx(90000, 0, '2026-06-01')] });
    expect(sortRentGroups([c, b, a], 'deposit').map((g) => g.name)).toEqual(['A', 'B', 'C']);
  });

  it('monthly — 최고 월세 내림차순, 원본 배열 불변', () => {
    const a = group('A', { maxMonthlyRent: 300 });
    const b = group('B', { transactions: [tx(10000, 450, '2026-06-01')] });
    const input = [a, b];
    expect(sortRentGroups(input, 'monthly').map((g) => g.name)).toEqual(['B', 'A']);
    expect(input.map((g) => g.name)).toEqual(['A', 'B']);
  });
});

// === 전월세 공유 이미지 카드 매핑 (상세 모달 → buildShareImage) ===

function rtx(over: Partial<RentTransaction>): RentTransaction {
  return {
    aptName: '래미안', district: '강남구', dong: '대치동',
    area: 84, floor: 12, deposit: 100000, monthlyRent: 0,
    date: '2026-07-01', buildYear: 2015, contractType: '',
    prevDeposit: null, prevMonthlyRent: null,
    ...over,
  };
}

describe('buildRentShareCard', () => {
  const fmt = (n: number) => `${n}만`;
  const fmtDate = (d: string) => d;
  const base = { aptName: '래미안', district: '강남구', dong: '대치동' as string | null, fmt, fmtDate };

  it('전세 — 직전 유사면적 전세 대비 보증금 등락 표기', () => {
    const filtered = [
      rtx({ deposit: 120000, date: '2026-07-01' }),
      rtx({ deposit: 100000, date: '2026-06-01' }),
    ];
    const card = buildRentShareCard({ ...base, filtered });
    expect(card).not.toBeNull();
    expect(card!.price).toBe('120000만');
    expect(card!.delta).toBe('▲ 20000만');
    expect(card!.up).toBe(true);
    expect(card!.high).toBe(false);
    expect(card!.meta).toContain('전세');
    expect(card!.location).toBe('강남구 대치동');
  });

  it('월세 — 등락 생략 + 보증금/월세 병기 표기', () => {
    const filtered = [
      rtx({ deposit: 10000, monthlyRent: 120, date: '2026-07-01' }),
      rtx({ deposit: 9000, monthlyRent: 110, date: '2026-06-01' }),
    ];
    const card = buildRentShareCard({ ...base, filtered })!;
    expect(card.delta).toBe('');
    expect(card.price).toBe('10000만/120만');
    expect(card.meta).toContain('월세');
  });

  it('갱신 계약 — meta 에 갱신 표기', () => {
    const filtered = [rtx({ contractType: '갱신' })];
    expect(buildRentShareCard({ ...base, filtered })!.meta).toContain('· 갱신');
  });

  it('면적 차이 ±6㎡ 초과 직전 거래는 등락 비교에서 제외', () => {
    const filtered = [
      rtx({ deposit: 120000, area: 84 }),
      rtx({ deposit: 200000, area: 114, date: '2026-06-01' }),
    ];
    expect(buildRentShareCard({ ...base, filtered })!.delta).toBe('');
  });

  it('빈 목록 → null', () => {
    expect(buildRentShareCard({ ...base, filtered: [] })).toBeNull();
  });
});

describe('rentSparkPts', () => {
  it('보증금 추이 — 좌표 범위 x 3~97 / y 7~49, 날짜 오름차순 정렬', () => {
    const pts = rentSparkPts([
      rtx({ deposit: 100000, date: '2026-05-01' }),
      rtx({ deposit: 150000, date: '2026-07-01' }),
      rtx({ deposit: 120000, date: '2026-06-01' }),
    ]);
    expect(pts).toHaveLength(3);
    expect(pts[0].x).toBeCloseTo(3);
    expect(pts[pts.length - 1].x).toBeCloseTo(97);
    // 최저 보증금(100000)이 y 최대(49), 최고 보증금(150000)이 y 최소(7)
    expect(pts[0].y).toBeCloseTo(49);
    expect(pts[2].y).toBeCloseTo(7);
    pts.forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(3);
      expect(p.x).toBeLessThanOrEqual(97);
      expect(p.y).toBeGreaterThanOrEqual(7);
      expect(p.y).toBeLessThanOrEqual(49);
    });
  });

  it('계약일이 전부 같으면 인덱스 균등 배치', () => {
    const pts = rentSparkPts([
      rtx({ deposit: 1000, date: '2026-07-01' }),
      rtx({ deposit: 2000, date: '2026-07-01' }),
    ]);
    expect(pts[0].x).toBeCloseTo(3);
    expect(pts[1].x).toBeCloseTo(97);
  });

  it('2건 미만 → 빈 배열', () => {
    expect(rentSparkPts([rtx({})])).toEqual([]);
    expect(rentSparkPts([])).toEqual([]);
  });
});
