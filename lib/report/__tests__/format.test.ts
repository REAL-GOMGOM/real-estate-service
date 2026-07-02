/**
 * report/format 특성테스트 (Y5) — 가격·퍼센트 표기 현재 동작 고정.
 *
 * ⚠️ 알려진 특성(버그 후보, 의도 확인 전 고정만):
 *   compact 모드 조 단위에서 남는 억이 "조 단위 소수"로 계산되어 억으로 표기됨.
 *   예) 1조 5,000억 → '1조 0.5억' (기대했을 표기: '1조 5,000억' 또는 '1.5조')
 *   수정 시 이 테스트를 의도적으로 갱신할 것.
 */
import { describe, it, expect } from 'vitest';
import { formatKoreanPrice, formatPercent } from '../format';

describe('formatKoreanPrice — 기본 모드', () => {
  it('0·음수 → em dash', () => {
    expect(formatKoreanPrice(0)).toBe('—');
    expect(formatKoreanPrice(-1)).toBe('—');
  });

  it('억+만원 조합', () => {
    expect(formatKoreanPrice(1_230_000_000)).toBe('12억 3,000만원');
  });

  it('정확히 억 단위 → 만원 생략', () => {
    expect(formatKoreanPrice(500_000_000)).toBe('5억');
  });

  it('1억 미만 → 만원만', () => {
    expect(formatKoreanPrice(50_000_000)).toBe('5,000만원');
  });

  it('만원 미만 금액은 만 단위 반올림 (9,999원 → 1만원)', () => {
    expect(formatKoreanPrice(9_999)).toBe('1만원');
  });

  it('조 단위', () => {
    expect(formatKoreanPrice(1_000_000_000_000)).toBe('1조');
    expect(formatKoreanPrice(1_500_000_000_000)).toBe('1조 5,000억');
    expect(formatKoreanPrice(1_234_500_000_000)).toBe('1조 2,345억');
  });
});

describe('formatKoreanPrice — compact 모드', () => {
  it('억 소수 표기', () => {
    expect(formatKoreanPrice(1_230_000_000, { compact: true })).toBe('12.3억');
    expect(formatKoreanPrice(500_000_000, { compact: true })).toBe('5억');
  });

  it('1억 미만 → 만 표기(원 생략)', () => {
    expect(formatKoreanPrice(50_000_000, { compact: true })).toBe('5,000만');
    expect(formatKoreanPrice(9_999, { compact: true })).toBe('1만');
  });

  it('⚠️ 특성: 조 단위 잔여 억이 조 소수로 잘못 표기됨 (버그 후보 — 고정만)', () => {
    expect(formatKoreanPrice(1_500_000_000_000, { compact: true })).toBe('1조 0.5억');
    expect(formatKoreanPrice(1_234_500_000_000, { compact: true })).toBe('1조 0.2억');
    expect(formatKoreanPrice(1_000_000_000_000, { compact: true })).toBe('1조');
  });
});

describe('formatPercent', () => {
  it('양수는 + 접두, 소수 1자리', () => {
    expect(formatPercent(0.123)).toBe('+12.3%');
    expect(formatPercent(0.345)).toBe('+34.5%');
  });

  it('0은 +0.0%, 음수는 - 그대로', () => {
    expect(formatPercent(0)).toBe('+0.0%');
    expect(formatPercent(-0.05)).toBe('-5.0%');
  });
});
