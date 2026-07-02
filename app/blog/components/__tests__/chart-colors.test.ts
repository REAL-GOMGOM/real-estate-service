import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CHART_COLORS,
  pickDefaultColor,
  getGradientFill,
  getGradientTextFill,
  resolveChartColor,
  warnInvalidChartColor,
} from '@/lib/chart-colors';

describe('CHART_COLORS hex 일관성', () => {
  it('HorizontalBarChart의 COLORS와 동일 hex (회귀 안전망)', () => {
    expect(CHART_COLORS.red).toBe('#dc2626');
    expect(CHART_COLORS.orange).toBe('#ea580c');
    expect(CHART_COLORS.blue).toBe('#2563eb');
    expect(CHART_COLORS.darkBlue).toBe('#1d4ed8');
    expect(CHART_COLORS.gray).toBe('#6b7280');
  });

  // 사이클 S Step S-2 — DemographicShiftBars 전용 토큰
  it('yellow #fbbf24 + amberOrange #f97316 (DemographicShiftBars 전용)', () => {
    expect(CHART_COLORS.yellow).toBe('#fbbf24');
    expect(CHART_COLORS.amberOrange).toBe('#f97316');
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

// ─── 사이클 S Step S-1 ───
describe('resolveChartColor (4개 차트 공통 헬퍼)', () => {
  it('유효한 hex 코드 → 그대로 반환', () => {
    expect(resolveChartColor('#9ca3af', 0, 'category')).toBe('#9ca3af');
    expect(resolveChartColor('#dc2626', 1, 'category')).toBe('#dc2626');
  });

  it('5색 키워드 → CHART_COLORS 매핑', () => {
    expect(resolveChartColor('red', 0, 'category')).toBe(CHART_COLORS.red);
    expect(resolveChartColor('gray', 0, 'category')).toBe(CHART_COLORS.gray);
  });

  it('미지정 + category intent → CATEGORY_ORDER 순환 (red 시작)', () => {
    expect(resolveChartColor(undefined, 0, 'category')).toBe(CHART_COLORS.red);
    expect(resolveChartColor(undefined, 1, 'category')).toBe(CHART_COLORS.blue);
  });

  it('미지정 + series intent → SERIES_ORDER 순환 (gray 시작)', () => {
    expect(resolveChartColor(undefined, 0, 'series')).toBe(CHART_COLORS.gray);
    expect(resolveChartColor(undefined, 1, 'series')).toBe(CHART_COLORS.red);
  });

  it('잘못된 hex (#xyz) → 자동 할당 fallback', () => {
    expect(resolveChartColor('#xyz' as `#${string}`, 0, 'category')).toBe(CHART_COLORS.red);
  });

  it('잘못된 키워드 → 자동 할당 fallback', () => {
    expect(resolveChartColor('purple' as never, 0, 'category')).toBe(CHART_COLORS.red);
  });

  // 사이클 S Step S-2 — yellow/amberOrange 키워드 매핑 + 자동 할당 미포함
  it('yellow 키워드 → #fbbf24 매핑', () => {
    expect(resolveChartColor('yellow', 0, 'category')).toBe('#fbbf24');
    expect(resolveChartColor('yellow', 3, 'series')).toBe('#fbbf24');
  });

  it('amberOrange 키워드 → #f97316 매핑', () => {
    expect(resolveChartColor('amberOrange', 0, 'category')).toBe('#f97316');
    expect(resolveChartColor('amberOrange', 2, 'series')).toBe('#f97316');
  });

  it('자동 할당은 5색 순환 유지 (yellow/amberOrange 미포함)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      seen.add(resolveChartColor(undefined, i, 'category'));
      seen.add(resolveChartColor(undefined, i, 'series'));
    }
    expect(seen.has(CHART_COLORS.yellow)).toBe(false);
    expect(seen.has(CHART_COLORS.amberOrange)).toBe(false);
    expect(seen.size).toBe(5); // red, orange, blue, darkBlue, gray만
  });
});

describe('warnInvalidChartColor (dev warn 통합 헬퍼)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    warnSpy.mockRestore();
  });

  it('알 수 없는 키워드 → 경고 (컴포넌트명 + context + color 포함)', () => {
    warnInvalidChartColor('TestChart', 'purple' as never, 'data[0].');
    const calls = warnSpy.mock.calls.flat();
    expect(calls.some((c: unknown) => typeof c === 'string' && c.includes('[TestChart]'))).toBe(true);
    expect(calls.some((c: unknown) => typeof c === 'string' && c.includes('data[0].color="purple"'))).toBe(true);
    expect(calls.some((c: unknown) => typeof c === 'string' && c.includes('자동 할당'))).toBe(true);
  });

  it('유효한 키워드 → 경고 없음', () => {
    warnInvalidChartColor('TestChart', 'red', 'data[0].');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('유효한 hex → 경고 없음', () => {
    warnInvalidChartColor('TestChart', '#9ca3af', 'data[0].');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('undefined → 경고 없음 (정상 자동 할당)', () => {
    warnInvalidChartColor('TestChart', undefined, 'data[0].');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('prod 환경 → 경고 없음 (DCE)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    warnInvalidChartColor('TestChart', 'purple' as never, 'data[0].');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
