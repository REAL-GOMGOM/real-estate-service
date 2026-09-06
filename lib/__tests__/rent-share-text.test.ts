/**
 * rent-share-text 단위 테스트 — 전월세 대칭.
 * 전세/월세 분기(월세는 최고가 라인 없음)와 갱신 종전가 표기를 잠근다.
 */
import { describe, it, expect } from 'vitest';
import { rentTxKey, buildRentPeakLine, buildRentTxShareText, type RentTxShareTextInput } from '../rent-share-text';
import { PARTIAL_TRANSACTION_NOTICE } from '../tx-share-text';
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
  it('일부 월 자료가 빠지면 보증금 최고가 비교를 만들지 않는다', () => {
    expect(buildRentPeakLine({ deposit: 66000, peak: 66000, prevPeak: 60000, months: 36, fmt: fmtPrice, dataComplete: false }))
      .toBe('');
  });
  it('완전한 자료 옵션은 기존 기본 출력을 바꾸지 않는다', () => {
    const input = { deposit: 66000, peak: 66000, prevPeak: 60000, months: 36, fmt: fmtPrice };
    expect(buildRentPeakLine({ ...input, dataComplete: true })).toBe(buildRentPeakLine(input));
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

  const input: RentTxShareTextInput = {
    aptName: '양지마을(금호1)', location: '성남시 분당구 수내동',
    tx: { deposit: 66000, monthlyRent: 0, area: 84, floor: 5, date: '2026-06-16', contractType: '신규', prevDeposit: null, prevMonthlyRent: null },
    peakLine: '3년 내 최고 보증금 · 종전 6억 +6,000만', fmt: fmtPrice, fmtDate,
  };

  it('부분 전세 자료에서는 계약 가격·면적·날짜를 보존하고 최고 보증금을 주장하지 않는다', () => {
    const text = buildRentTxShareText({ ...input, dataComplete: false });
    expect(text).toBe('양지마을(금호1) 전세 6.6억 (84㎡·25평·5층·26.06.16 계약) · 평당 보증금 2,597만 · 신규 · 일부 월 자료 누락 · 확인된 거래 기준 · 성남시 분당구 수내동 — 내집 My.ZIP');
    expect(text).not.toMatch(/🔥|최고|신고가|경신/);
    expect(text.split(PARTIAL_TRANSACTION_NOTICE)).toHaveLength(2);
  });

  it('부분 월세 자료에서도 공급된 최고가를 버리고 실제 갱신 계약 정보와 한계를 보존한다', () => {
    const text = buildRentTxShareText({
      ...input,
      tx: { ...input.tx, deposit: 50000, monthlyRent: 150, contractType: '갱신', prevDeposit: 45000, prevMonthlyRent: 140 },
      peakLine: '🔥 3년 내 최고가 경신',
      dataComplete: false,
    });
    expect(text).toContain('양지마을(금호1) 월세 5억/150만 (84㎡·25평·5층·26.06.16 계약)');
    expect(text).toContain('갱신(종전 4.5억/140만)');
    expect(text).toContain(PARTIAL_TRANSACTION_NOTICE);
    expect(text).toContain('성남시 분당구 수내동 — 내집 My.ZIP');
    expect(text).not.toMatch(/🔥|최고|신고가|경신/);
  });

  it('비교 문구가 없어도 부분 자료 안내는 항상 포함한다', () => {
    expect(buildRentTxShareText({ ...input, peakLine: '', dataComplete: false }))
      .toContain(PARTIAL_TRANSACTION_NOTICE);
  });

  it('완전한 자료 옵션은 기존 공유 본문을 그대로 유지한다', () => {
    const text = buildRentTxShareText(input);
    expect(buildRentTxShareText({ ...input, dataComplete: true })).toBe(text);
    expect(text).not.toContain(PARTIAL_TRANSACTION_NOTICE);
    expect(text).toContain(input.peakLine);
  });
});
