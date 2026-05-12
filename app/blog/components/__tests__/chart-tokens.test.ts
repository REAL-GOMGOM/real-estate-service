import { describe, it, expect } from 'vitest';
import { estimateTextWidth } from '@/lib/chart-tokens';

/**
 * 사이클 N Step 5 — 한글 legend 너비 추정 보정 검증.
 *
 * 한글 13px/char + 영문/숫자/기호 7px/char (system-ui 12px 기준).
 * 사용처: LineChart / StackedBarChart Legend 너비 산정.
 */
describe('estimateTextWidth', () => {
  it('영문만 → length × 7', () => {
    expect(estimateTextWidth('Seoul')).toBe(5 * 7);
  });

  it('한글만 → length × 13', () => {
    expect(estimateTextWidth('강남구')).toBe(3 * 13);
  });

  it('한글 + 영문 + 공백 혼합 → 가중 합산', () => {
    // "Seoul 강남구" = 5 영문 + 1 공백(Latin) + 3 한글
    expect(estimateTextWidth('Seoul 강남구')).toBe(6 * 7 + 3 * 13);
  });

  it('빈 문자열 → 0', () => {
    expect(estimateTextWidth('')).toBe(0);
  });

  it('숫자·기호 → 7px (Latin 분류)', () => {
    // '2026.5%' = 7 문자, 한글 0건
    expect(estimateTextWidth('2026.5%')).toBe(7 * 7);
  });
});
