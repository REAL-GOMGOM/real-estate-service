/**
 * HorizontalBarChart 오버플로 가드 회귀 테스트 (사이클 U).
 *
 * 2026-07-03 실사고: 용적률(200~300%) 데이터에 autoScale 미지정 →
 * 기본 scale=10으로 막대 폭 3,000px → viewBox(640) 초과, 전부 풀길이로 렌더.
 * 가드: 초과 시에만 scale 자동 축소. 정상 범위 데이터는 기존 계산 그대로.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HorizontalBarChart } from '../HorizontalBarChart';

/** 막대 rect(height=20)의 width 목록 추출 */
function barWidths(html: string): number[] {
  const widths: number[] = [];
  const re = /<rect[^>]*height="20"[^>]*width="([\d.]+)"|<rect[^>]*width="([\d.]+)"[^>]*height="20"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    widths.push(parseFloat(m[1] ?? m[2]));
  }
  return widths;
}

describe('오버플로 가드 — 실사고 케이스 (용적률 %)', () => {
  it('값 200~300 + autoScale 미지정 → 막대가 viewBox 안으로 자동 축소', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '용적률·건폐율 변경 전후 비교 (%)',
        unit: '%',
        data: [
          { label: '용적률 변경 전', value: 249.9, color: 'red' },
          { label: '용적률 변경 후', value: 300.0, color: 'blue' },
        ],
      }),
    );
    const widths = barWidths(html);
    expect(widths).toHaveLength(2);
    // 가드 전에는 2,499px·3,000px로 viewBox(640) 초과 — 가드 후 전부 가용 폭 이내
    for (const w of widths) {
      expect(w).toBeLessThanOrEqual(640 - 200 + 1);
    }
    // 값 비율 보존 (249.9 : 300)
    const sorted = [...widths].sort((a, b) => a - b);
    expect(sorted[0] / sorted[1]).toBeCloseTo(249.9 / 300, 2);
  });
});

describe('오버플로 가드 — 정상 데이터 회귀 0', () => {
  it('통상 변동률 값(±25 이내)은 기존 scale=10 계산 그대로 (value×10px)', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '자치구별 변동률',
        unit: '%',
        data: [
          { label: '강남', value: 24.0, color: 'red' },
          { label: '송파', value: 12.3, color: 'orange' },
          { label: '용산', value: -3.2, color: 'blue' },
        ],
      }),
    );
    const widths = barWidths(html).sort((a, b) => a - b);
    expect(widths).toEqual([32, 123, 240]); // |value| × 10
  });

  it('autoScale 명시 사용 경로는 가드와 무관하게 기존 동작 유지', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '용적률 (autoScale)',
        unit: '%',
        autoScale: true,
        data: [
          { label: '전', value: 249.9 },
          { label: '후', value: 300.0 },
        ],
      }),
    );
    const widths = barWidths(html);
    expect(widths).toHaveLength(2);
    for (const w of widths) {
      expect(w).toBeLessThanOrEqual(640);
    }
  });
});
