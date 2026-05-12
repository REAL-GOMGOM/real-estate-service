import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { HorizontalBarChart } from '../HorizontalBarChart';
import { CHART_COLORS, pickDefaultColor } from '@/lib/chart-colors';

/**
 * 사이클 Q — HorizontalBarChart hex 코드 color 직접 지원 검증.
 *
 * resolveRowColor 우선순위:
 *   1. 유효한 hex → 그대로 fill 적용
 *   2. 5색 키워드 → COLORS 매핑
 *   3. 미지정 / 잘못된 값 → pickDefaultColor 자동 할당 (P-2)
 *
 * NODE_ENV=production 강제하여 dev warn/info path는 격리.
 */
describe('HorizontalBarChart hex color 지원 (사이클 Q)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hex 코드 직접 → 그대로 fill 적용', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: 'hex 테스트',
        unit: '',
        data: [
          { label: 'A', value: 10, color: '#9ca3af' },
          { label: 'B', value: 20, color: '#dc2626' },
        ],
      }),
    );
    expect(html).toContain('fill="#9ca3af"');
    expect(html).toContain('fill="#dc2626"');
  });

  it('키워드 → COLORS 매핑 그대로 동작 (회귀 0)', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '키워드 테스트',
        unit: '',
        data: [
          { label: 'A', value: 10, color: 'red' },
          { label: 'B', value: 20, color: 'gray' },
        ],
      }),
    );
    expect(html).toContain(`fill="${CHART_COLORS.red}"`);   // #dc2626
    expect(html).toContain(`fill="${CHART_COLORS.gray}"`);  // #6b7280
  });

  it('hex 3자리 짧은 코드 → 허용', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '짧은 hex',
        unit: '',
        data: [{ label: 'A', value: 10, color: '#abc' }],
      }),
    );
    expect(html).toContain('fill="#abc"');
  });

  it('hex 8자리 RGBA → 허용', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: 'RGBA hex',
        unit: '',
        data: [{ label: 'A', value: 10, color: '#9ca3af80' }],
      }),
    );
    expect(html).toContain('fill="#9ca3af80"');
  });

  it('잘못된 hex (#xyz, #12) → 자동 할당 fallback', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '잘못된 hex',
        unit: '',
        data: [
          // '#xyz': 3자리지만 hex 문자 외 → 매칭 실패
          { label: 'A', value: 10, color: '#xyz' as `#${string}` },
          // '#12': 길이 부족 (regex {3,8} 미달) → 매칭 실패
          { label: 'B', value: 20, color: '#12' as `#${string}` },
        ],
      }),
    );
    // CATEGORY_ORDER[0] = red, CATEGORY_ORDER[1] = blue
    expect(html).toContain(`fill="${CHART_COLORS[pickDefaultColor(0, 'category')]}"`); // #dc2626
    expect(html).toContain(`fill="${CHART_COLORS[pickDefaultColor(1, 'category')]}"`); // #2563eb
    // 잘못된 hex 문자열 자체는 출력되지 않아야 함
    expect(html).not.toContain('fill="#xyz"');
    expect(html).not.toContain('fill="#12"');
  });

  it('hex + 키워드 + 미지정 혼재', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '혼재',
        unit: '',
        data: [
          { label: 'A', value: 10, color: '#9ca3af' },   // index 0: hex 그대로
          { label: 'B', value: 20, color: 'orange' },     // index 1: 키워드 → #ea580c
          { label: 'C', value: 30 },                       // index 2: 미지정 → CATEGORY_ORDER[2] = orange = #ea580c
        ],
      }),
    );
    expect(html).toContain('fill="#9ca3af"');
    expect(html).toContain(`fill="${CHART_COLORS.orange}"`);
  });
});
