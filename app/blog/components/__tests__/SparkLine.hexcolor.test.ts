import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SparkLine } from '../SparkLine';
import { CHART_COLORS } from '@/lib/chart-colors';

/**
 * 사이클 O Phase 1 — SparkLine hex color 지원 검증.
 * 통일된 패턴: NODE_ENV stub 없음 (dev warn은 정상 입력이라 미발동).
 */
describe('SparkLine hex color 지원 (사이클 O Phase 1)', () => {
  it('hex 코드 직접 → stroke 적용 (추세 fallback 무시)', () => {
    const html = renderToStaticMarkup(
      createElement(SparkLine, {
        data: [10, 20, 30],
        color: '#9ca3af',
        ariaLabel: 'hex',
      }),
    );
    expect(html).toContain('stroke="#9ca3af"');
    // 상승 추세지만 명시 hex가 fallback red를 덮음
    expect(html).not.toContain(`stroke="${CHART_COLORS.red}"`);
  });

  it('키워드 → CHART_COLORS hex로 렌더', () => {
    const html = renderToStaticMarkup(
      createElement(SparkLine, {
        data: [10, 20, 30],
        color: 'darkBlue',
        ariaLabel: '키워드',
      }),
    );
    expect(html).toContain(`stroke="${CHART_COLORS.darkBlue}"`);
  });
});
