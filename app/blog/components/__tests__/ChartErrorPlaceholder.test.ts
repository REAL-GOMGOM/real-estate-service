import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ChartErrorPlaceholder } from '../ChartErrorPlaceholder';

/**
 * Phase 8-1 — ChartErrorPlaceholder dev/prod 분기 검증.
 * vi.stubEnv는 동적 import 환경에선 jsxDEV 누락 유발 → 본 테스트는 정적 import 패턴.
 */
describe('ChartErrorPlaceholder', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('공통 출력 — 안내 텍스트 + role/aria + 점선 박스', () => {
    const html = renderToStaticMarkup(
      createElement(ChartErrorPlaceholder, {
        chartName: 'LineChart',
        reason:    'series prop이 배열이 아닙니다',
      }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="차트를 표시할 수 없습니다"');
    expect(html).toContain('차트를 표시할 수 없습니다');
    expect(html).toContain('stroke-dasharray="6 4"');
  });

  it('dev 환경 → reason 상세 노출', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const html = renderToStaticMarkup(
      createElement(ChartErrorPlaceholder, {
        chartName: 'LineChart',
        reason:    'series prop이 배열이 아닙니다',
      }),
    );
    expect(html).toContain('[LineChart] series prop이 배열이 아닙니다');
  });

  it('prod 환경 → reason 상세 비노출 (담백)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const html = renderToStaticMarkup(
      createElement(ChartErrorPlaceholder, {
        chartName: 'LineChart',
        reason:    'series prop이 배열이 아닙니다',
      }),
    );
    expect(html).not.toContain('[LineChart]');
    expect(html).not.toContain('series prop이 배열이 아닙니다');
    // 공통 메시지는 prod에서도 표시
    expect(html).toContain('차트를 표시할 수 없습니다');
  });

  it('width/height 커스텀 적용 (SparkLine 같은 인라인 차트용)', () => {
    const html = renderToStaticMarkup(
      createElement(ChartErrorPlaceholder, {
        chartName: 'SparkLine',
        reason:    'data prop이 배열이 아닙니다',
        width:  120,
        height: 32,
      }),
    );
    expect(html).toContain('viewBox="0 0 120 32"');
  });
});
