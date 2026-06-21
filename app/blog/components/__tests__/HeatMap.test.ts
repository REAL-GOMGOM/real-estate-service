import { describe, it, expect } from 'vitest';
import {
  computeCellLayout,
  resolveCellColor,
  resolveCellTextColor,
  computeValueRange,
  formatCellValue,
  generateAriaDesc,
  NULL_CELL_FILL,
} from '../HeatMap.utils';
import { getGradientFill } from '@/lib/chart-colors';

/**
 * 사이클 O Phase 2 — HeatMap 단위 테스트.
 * 셀 좌표·null 가드·gradient 매핑·colorScale override·렌더 검증.
 */

const PLOT = { x: 80, y: 60, width: 400, height: 200 };

describe('computeCellLayout', () => {
  it('정상 — 셀 크기 균등 분할', () => {
    // 2행 × 4열, gap 2, plot 400×200
    // cellWidth = (400 - 2×3)/4 = 98.5, cellHeight = (200 - 2×1)/2 = 99
    const layout = computeCellLayout(
      ['r1', 'r2'],
      ['c1', 'c2', 'c3', 'c4'],
      PLOT,
      2,
    );
    expect(layout.cellWidth).toBe(98.5);
    expect(layout.cellHeight).toBe(99);
  });

  it('첫 셀 좌표 = plotArea 좌상', () => {
    const layout = computeCellLayout(['r1'], ['c1'], PLOT, 0);
    expect(layout.cellAt(0, 0)).toEqual({ x: 80, y: 60 });
  });

  it('우하 모서리 셀 좌표', () => {
    const layout = computeCellLayout(['r1', 'r2'], ['c1', 'c2'], PLOT, 0);
    // cellWidth 200, cellHeight 100 (gap 0)
    // cellAt(1, 1) = { x: 80 + 200, y: 60 + 100 }
    expect(layout.cellAt(1, 1)).toEqual({ x: 280, y: 160 });
  });

  it('빈 행/열 → 셀 크기 0', () => {
    const empty = computeCellLayout([], [], PLOT, 2);
    expect(empty.cellWidth).toBe(0);
    expect(empty.cellHeight).toBe(0);
  });
});

describe('resolveCellColor', () => {
  it('null → 회색(NULL_CELL_FILL)', () => {
    expect(resolveCellColor(null)).toBe(NULL_CELL_FILL);
  });

  it('값 + colorScale 미지정 → getGradientFill', () => {
    expect(resolveCellColor(20)).toBe(getGradientFill(20)); // 양수 최대 #dc2626
    expect(resolveCellColor(-3)).toBe(getGradientFill(-3));
    expect(resolveCellColor(0)).toBe(getGradientFill(0));
  });

  it('colorScale override → 사용자 함수 결과', () => {
    const customScale = (v: number) => v > 0 ? '#ff0000' : '#0000ff';
    expect(resolveCellColor(10, customScale)).toBe('#ff0000');
    expect(resolveCellColor(-5, customScale)).toBe('#0000ff');
  });

  it('colorScale 있어도 null은 회색 우선', () => {
    const customScale = (_v: number) => '#ff0000';
    expect(resolveCellColor(null, customScale)).toBe(NULL_CELL_FILL);
  });
});

describe('resolveCellTextColor', () => {
  it('null 셀(회색) → subLabel 어두운 회색', () => {
    expect(resolveCellTextColor(NULL_CELL_FILL)).toBe('#6b7280');
  });

  it('옅은 cream 셀 → 진한 갈색 (getGradientTextFill 위임)', () => {
    expect(resolveCellTextColor('#fef3c7')).toBe('#a16207');
    expect(resolveCellTextColor('#fde68a')).toBe('#a16207');
  });

  it('진한 셀 → 입력값 그대로 (getGradientTextFill 위임)', () => {
    expect(resolveCellTextColor('#dc2626')).toBe('#dc2626');
  });
});

describe('computeValueRange', () => {
  it('null 제외 min/max', () => {
    expect(computeValueRange([
      [10, null, 20],
      [-5, 15, null],
    ])).toEqual({ min: -5, max: 20 });
  });

  it('전체 null → { min: 0, max: 0 }', () => {
    expect(computeValueRange([[null, null], [null, null]])).toEqual({ min: 0, max: 0 });
  });

  it('빈 격자 → { min: 0, max: 0 }', () => {
    expect(computeValueRange([])).toEqual({ min: 0, max: 0 });
  });
});

describe('formatCellValue', () => {
  it('null → 빈 문자열', () => {
    expect(formatCellValue(null, '%')).toBe('');
  });
  it('정수 → 정수 그대로 + unit', () => {
    expect(formatCellValue(20, '%')).toBe('20%');
  });
  it('소수 → 소수 1자리 + unit', () => {
    expect(formatCellValue(3.14, '%')).toBe('3.1%');
    expect(formatCellValue(-2.5, '%')).toBe('-2.5%');
  });
});

describe('generateAriaDesc', () => {
  it('빈 행/열 → 빈 메시지', () => {
    expect(generateAriaDesc([], [], [], '%')).toBe('데이터가 없는 빈 히트맵');
    expect(generateAriaDesc(['r'], [], [], '%')).toBe('데이터가 없는 빈 히트맵');
  });

  it('정상 → 격자 크기 + 값 범위', () => {
    const desc = generateAriaDesc(
      ['1월', '2월'],
      ['강남', '서초'],
      [[10, 20], [15, 25]],
      '%',
    );
    expect(desc).toContain('2행 × 2열');
    expect(desc).toContain('10.0%');
    expect(desc).toContain('25.0%');
  });

  it('null 셀 포함 → 개수 표기', () => {
    const desc = generateAriaDesc(
      ['r1', 'r2'],
      ['c1', 'c2'],
      [[10, null], [null, 20]],
      '%',
    );
    expect(desc).toContain('null 셀 2/4개');
  });
});

// ─── 렌더 테스트 ───
describe('HeatMap render', () => {
  it('빈 격자 → placeholder', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { HeatMap } = await import('../HeatMap');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(HeatMap, { title: '빈', rows: [], cols: [], values: [] }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('데이터 없음');
  });

  it('정상 격자 → rect 개수 = 행×열', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { HeatMap } = await import('../HeatMap');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(HeatMap, {
        title: '정상',
        rows: ['1월', '2월'],
        cols: ['강남', '서초', '송파'],
        values: [[10, -5, 0], [20, null, 15]],
      }),
    );
    const rectCount = (html.match(/<rect /g) ?? []).length;
    expect(rectCount).toBe(6); // 2×3
  });

  it('null 셀 → 회색 fill', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { HeatMap } = await import('../HeatMap');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(HeatMap, {
        title: 'null 포함',
        rows: ['r1'],
        cols: ['c1', 'c2'],
        values: [[10, null]],
      }),
    );
    expect(html).toContain(`fill="${NULL_CELL_FILL}"`);
  });

  it('showValues=false → 셀 텍스트 없음', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { HeatMap } = await import('../HeatMap');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(HeatMap, {
        title: 'no values',
        rows: ['r1'],
        cols: ['c1'],
        values: [[10]],
        showValues: false,
      }),
    );
    expect(html).not.toContain('>10%<');
  });
});
