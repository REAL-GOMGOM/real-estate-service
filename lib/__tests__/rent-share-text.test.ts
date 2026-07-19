/**
 * rent-share-text 단위 테스트 — 전월세 대칭.
 * 전세/월세 분기(월세는 최고가 라인 없음)와 갱신 종전가 표기를 잠근다.
 */
import { describe, it, expect } from 'vitest';
import { rentTxKey, buildRentPeakLine, buildRentTxShareText } from '../rent-share-text';
import { fmtPrice } from '../tx-shared';

const fmtDate = (d: string) => d.slice(2).replace(/-/g, '.');

describe('rentTxKey', () => {
  it('보증금·월세까지 포함한 결정적 식별자', () => {
    expect(rentTxKey({ date: '2026-06-16', area: 84, floor: 5, deposit: 66000, monthlyRent: 0 }))
      .toBe('2026-06-16_84_5_66000_0');
    // 같은 조건에 월세만 달라도 다른 계약
    expect(rentTxKey({ date: '2026-06-16', area: 84, floor: 5, deposit: 66000, monthlyRent: 120 }))
      .not.toBe(rentTxKey({ date: '2026-06-16', area: 84, floor: 5, deposit: 66000, monthlyRent: 0 }));
  });
});

describe('buildRentPeakLine — 보증금 기준 + 기간 캡션', () => {
  it('경신', () => {
    expect(buildRentPeakLine({ deposit: 66000, peak: 66000, prevPeak: 60000, months: 36, fmt: fmtPrice }))
      .toBe('3년 내 최고 보증금 · 종전 6억 +6,000만');
  });
  it('미달', () => {
    expect(buildRentPeakLine({ deposit: 60000, peak: 66000, prevPeak: null, months: 6, fmt: fmtPrice }))
      .toBe('6개월 내 최고 보증금 6.6억 대비 -6,000만');
  });
  it('데이터 없으면 빈 문자열', () => {
    expect(buildRentPeakLine({ deposit: 0, peak: 0, prevPeak: null, months: 6, fmt: fmtPrice })).toBe('');
  });
});

describe('buildRentTxShareText', () => {
  it('전세 — 평당 보증금·최고가 라인 포함', () => {
    const s = buildRentTxShareText({
      aptName: '양지마을(금호1)', location: '성남시 분당구 수내동',
      tx: { deposit: 66000, monthlyRent: 0, area: 84, floor: 5, date: '2026-06-16', contractType: '신규', prevDeposit: null, prevMonthlyRent: null },
      peakLine: '3년 내 최고 보증금', fmt: fmtPrice, fmtDate,
    });
    expect(s).toContain('전세 6.6억');
    expect(s).toContain('평당 보증금');
    expect(s).toContain('3년 내 최고 보증금');
    expect(s).toContain('신규');
  });

  it('월세 — 보증금/월세 병기, 최고가 라인 없음, 갱신 종전가 표기', () => {
    const s = buildRentTxShareText({
      aptName: '래미안대치팰리스', location: '강남구 대치동',
      tx: { deposit: 50000, monthlyRent: 150, area: 94, floor: 12, date: '2026-06-03', contractType: '갱신', prevDeposit: 45000, prevMonthlyRent: 140 },
      peakLine: '', fmt: fmtPrice, fmtDate,
    });
    expect(s).toContain('월세 5억/150만');
    expect(s).not.toContain('평당 보증금');
    expect(s).not.toContain('최고 보증금');
    expect(s).toContain('갱신(종전 4.5억/140만)');
  });
});
