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
  // 사이클 U 리디자인 팔레트 — 키 유지, hex 재정의 (회귀 안전망)
  it('표준 5색 hex 고정 (사이클 U 시안 톤)', () => {
    expect(CHART_COLORS.red).toBe('#E23B3B');
    expect(CHART_COLORS.orange).toBe('#E8663C');
    expect(CHART_COLORS.blue).toBe('#1B4DDB');
    expect(CHART_COLORS.darkBlue).toBe('#14213D');
    expect(CHART_COLORS.gray).toBe('#8A94A8');
  });

  // 사이클 S Step S-2 — DemographicShiftBars 전용 토큰 (사이클 U hex)
  it('yellow #EBC15C + amberOrange #F0A24B (DemographicShiftBars 전용)', () => {
    expect(CHART_COLORS.yellow).toBe('#EBC15C');
    expect(CHART_COLORS.amberOrange).toBe('#F0A24B');
  });

  // 사이클 U 신설 2색 — 기존 글 영향 없는 추가 키
  it('rose #E5687A + green #6FC08A (사이클 U 신설)', () => {
    expect(CHART_COLORS.rose).toBe('#E5687A');
    expect(CHART_COLORS.green).toBe('#6FC08A');
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
  it('양수 8단계 임계값 (사이클 U 레드·앰버 농도)', () => {
    expect(getGradientFill(20)).toBe('#C92F2F');
    expect(getGradientFill(13)).toBe('#E23B3B');
    expect(getGradientFill(11)).toBe('#E8663C');
    expect(getGradientFill(7)).toBe('#F0A24B');
    expect(getGradientFill(5)).toBe('#EBC15C');
    expect(getGradientFill(3)).toBe('#F2D48A');
    expect(getGradientFill(1.5)).toBe('#F8E7B8');
    expect(getGradientFill(0)).toBe('#FCF3DC');
  });

  it('음수 5단계 임계값 (사이클 U 브랜드 블루 농도)', () => {
    expect(getGradientFill(-0.5)).toBe('#B9CBF5');
    expect(getGradientFill(-1.5)).toBe('#8FACEE');
    expect(getGradientFill(-3)).toBe('#5B82E8');
    expect(getGradientFill(-6)).toBe('#2E5CE0');
    expect(getGradientFill(-10)).toBe('#1B4DDB');
  });
});

describe('getGradientTextFill', () => {
  it('옅은 크림 계열(#FCF3DC, #F8E7B8) → 진한 앰버 텍스트(#8A6A1F)', () => {
    expect(getGradientTextFill('#FCF3DC')).toBe('#8A6A1F');
    expect(getGradientTextFill('#F8E7B8')).toBe('#8A6A1F');
  });
  it('그 외 색상 → 입력값 그대로', () => {
    expect(getGradientTextFill('#E23B3B')).toBe('#E23B3B');
    expect(getGradientTextFill('#1B4DDB')).toBe('#1B4DDB');
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
  it('yellow 키워드 → #EBC15C 매핑', () => {
    expect(resolveChartColor('yellow', 0, 'category')).toBe('#EBC15C');
    expect(resolveChartColor('yellow', 3, 'series')).toBe('#EBC15C');
  });

  it('amberOrange 키워드 → #F0A24B 매핑', () => {
    expect(resolveChartColor('amberOrange', 0, 'category')).toBe('#F0A24B');
    expect(resolveChartColor('amberOrange', 2, 'series')).toBe('#F0A24B');
  });

  // 사이클 U — 신설 rose/green 키워드 매핑
  it('rose·green 키워드 → 신설 hex 매핑 (사이클 U)', () => {
    expect(resolveChartColor('rose', 0, 'category')).toBe('#E5687A');
    expect(resolveChartColor('green', 0, 'category')).toBe('#6FC08A');
  });

  it('자동 할당은 5색 순환 유지 (yellow/amberOrange/rose/green 미포함)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      seen.add(resolveChartColor(undefined, i, 'category'));
      seen.add(resolveChartColor(undefined, i, 'series'));
    }
    expect(seen.has(CHART_COLORS.yellow)).toBe(false);
    expect(seen.has(CHART_COLORS.amberOrange)).toBe(false);
    expect(seen.has(CHART_COLORS.rose)).toBe(false);
    expect(seen.has(CHART_COLORS.green)).toBe(false);
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
