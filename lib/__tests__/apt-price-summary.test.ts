import { describe, expect, it } from 'vitest';
import { summarizeAptTxns } from '../apt-price-summary';

const tx = (area: number, price: number, date: string) => ({ area, price, date });

describe('summarizeAptTxns — 평형 그룹핑', () => {
  it('전용면적 반올림 기준으로 그룹핑하고 면적 오름차순 정렬', () => {
    const s = summarizeAptTxns([
      tx(84.98, 300000, '2026-07-01'),
      tx(84.62, 320000, '2026-07-02'), // → 85 그룹
      tx(59.96, 200000, '2026-07-03'), // → 60 그룹
    ])!;
    expect(s.groups.map((g) => g.area)).toEqual([60, 85]);
    expect(s.groups[1].count).toBe(2);
    expect(s.groups[1].avg).toBe(310000);
  });

  it('전체 평균·건수 계산', () => {
    const s = summarizeAptTxns([
      tx(84, 300000, '2026-07-01'),
      tx(59, 100000, '2026-07-02'),
    ])!;
    expect(s.totalCount).toBe(2);
    expect(s.totalAvg).toBe(200000);
  });

  it('평 환산 (전용 84㎡ ≈ 25평)', () => {
    const s = summarizeAptTxns([tx(84, 300000, '2026-07-01')])!;
    expect(s.groups[0].pyeong).toBe(25);
  });
});

describe('summarizeAptTxns — 기본(best) 그룹 선정', () => {
  it('최다 거래 평형이 기본', () => {
    const s = summarizeAptTxns([
      tx(59, 200000, '2026-07-01'),
      tx(59, 210000, '2026-07-02'),
      tx(115, 500000, '2026-07-03'),
    ])!;
    expect(s.best.area).toBe(59);
  });

  it('건수 동률이면 국평(84㎡) 근접 우선', () => {
    const s = summarizeAptTxns([
      tx(115, 500000, '2026-07-01'),
      tx(84, 300000, '2026-07-02'),
    ])!;
    expect(s.best.area).toBe(84);
  });
});

describe('summarizeAptTxns — 거래 월 라벨', () => {
  it('여러 월이면 범위 표기', () => {
    const s = summarizeAptTxns([
      tx(84, 300000, '2026-04-15'),
      tx(84, 310000, '2026-07-02'),
    ])!;
    expect(s.periodLabel).toBe('26.04~26.07');
  });

  it('단월이면 단일 표기', () => {
    const s = summarizeAptTxns([
      tx(84, 300000, '2026-07-01'),
      tx(84, 310000, '2026-07-20'),
    ])!;
    expect(s.periodLabel).toBe('26.07');
  });

  it('구분자 없는 YYYYMMDD 포맷도 파싱', () => {
    const s = summarizeAptTxns([tx(84, 300000, '20260501')])!;
    expect(s.periodLabel).toBe('26.05');
  });

  it('날짜 파싱 전부 실패 시 기존 표기 폴백', () => {
    const s = summarizeAptTxns([tx(84, 300000, '???')])!;
    expect(s.periodLabel).toBe('최근 3개월');
  });
});

describe('summarizeAptTxns — 엣지', () => {
  it('빈 배열 → null', () => {
    expect(summarizeAptTxns([])).toBeNull();
  });

  it('가격·면적 0 이하 행은 제외, 전부 무효면 null', () => {
    expect(summarizeAptTxns([tx(0, 300000, '2026-07-01'), tx(84, 0, '2026-07-01')])).toBeNull();
  });
});
