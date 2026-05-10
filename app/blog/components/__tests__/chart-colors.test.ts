import { describe, it, expect } from 'vitest';
import {
  CHART_COLORS,
  pickDefaultColor,
  getGradientFill,
  getGradientTextFill,
} from '@/lib/chart-colors';

describe('CHART_COLORS hex 일관성', () => {
  it('HorizontalBarChart의 COLORS와 동일 hex (회귀 안전망)', () => {
    expect(CHART_COLORS.red).toBe('#dc2626');
    expect(CHART_COLORS.orange).toBe('#ea580c');
    expect(CHART_COLORS.blue).toBe('#2563eb');
    expect(CHART_COLORS.darkBlue).toBe('#1d4ed8');
    expect(CHART_COLORS.gray).toBe('#6b7280');
  });
});

describe('pickDefaultColor', () => {
  describe('series intent (시리즈 비교)', () => {
    it('index 0 → gray (기준값 친화)', () => {
      expect(pickDefaultColor(0, 'series')).toBe('gray');
    });
    it('index 1 → red (강조)', () => {
      expect(pickDefaultColor(1, 'series')).toBe('red');
    });
    it('index 4 → darkBlue', () => {
      expect(pickDefaultColor(4, 'series')).toBe('darkBlue');
    });
    it('index 5 → gray (5색 순환)', () => {
      expect(pickDefaultColor(5, 'series')).toBe('gray');
    });
  });

  describe('category intent (카테고리 분포)', () => {
    it('index 0 → red (강조 친화)', () => {
      expect(pickDefaultColor(0, 'category')).toBe('red');
    });
    it('index 1 → blue', () => {
      expect(pickDefaultColor(1, 'category')).toBe('blue');
    });
    it('index 4 → gray', () => {
      expect(pickDefaultColor(4, 'category')).toBe('gray');
    });
    it('index 5 → red (5색 순환)', () => {
      expect(pickDefaultColor(5, 'category')).toBe('red');
    });
  });
});

describe('getGradientFill', () => {
  it('양수 8단계 임계값', () => {
    expect(getGradientFill(20)).toBe('#dc2626');
    expect(getGradientFill(13)).toBe('#ef4444');
    expect(getGradientFill(11)).toBe('#f97316');
    expect(getGradientFill(7)).toBe('#f59e0b');
    expect(getGradientFill(5)).toBe('#fbbf24');
    expect(getGradientFill(3)).toBe('#fcd34d');
    expect(getGradientFill(1.5)).toBe('#fde68a');
    expect(getGradientFill(0)).toBe('#fef3c7');
  });

  it('음수 5단계 임계값', () => {
    expect(getGradientFill(-0.5)).toBe('#93c5fd');
    expect(getGradientFill(-1.5)).toBe('#60a5fa');
    expect(getGradientFill(-3)).toBe('#3b82f6');
    expect(getGradientFill(-6)).toBe('#2563eb');
    expect(getGradientFill(-10)).toBe('#1d4ed8');
  });
});

describe('getGradientTextFill', () => {
  it('cream 계열(#fef3c7, #fde68a) → 진한 갈색(#a16207)', () => {
    expect(getGradientTextFill('#fef3c7')).toBe('#a16207');
    expect(getGradientTextFill('#fde68a')).toBe('#a16207');
  });
  it('그 외 색상 → 입력값 그대로', () => {
    expect(getGradientTextFill('#dc2626')).toBe('#dc2626');
    expect(getGradientTextFill('#2563eb')).toBe('#2563eb');
  });
});
