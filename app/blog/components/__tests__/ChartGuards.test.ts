import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { LineChart } from '../LineChart';
import { AreaChart } from '../AreaChart';
import { HorizontalBarChart } from '../HorizontalBarChart';
import { DonutChart } from '../DonutChart';
import { StackedBarChart } from '../StackedBarChart';
import { ScatterPlot } from '../ScatterPlot';
import { RangeBarChart } from '../RangeBarChart';
import { HeatMap } from '../HeatMap';
import { GaugeChart } from '../GaugeChart';
import { SparkLine } from '../SparkLine';
import { DemographicShiftBars } from '../DemographicShiftBars';
import { AgeGroupBars } from '../AgeGroupBars';

/**
 * Phase 8-1 — 차트 12종 비정상 입력 방어 통합 검증.
 *
 * 원칙:
 * - 잘못된 props가 들어와도 throw 하지 않고 ChartErrorPlaceholder 반환
 * - placeholder 출력에 항상 "차트를 표시할 수 없습니다" 안내 텍스트 포함
 * - 진단 보고에서 가장 문제였던 "LineChart에 series 대신 data={...}" 케이스 명시 회귀
 *
 * NODE_ENV stub 미사용 (Phase 1 통일 패턴) — 일부 dev warn은 발동되지만
 * 가드는 그 전에 동작하므로 영향 없음.
 */

const ERROR_MARKER = '차트를 표시할 수 없습니다';

// 모든 케이스에서 throw가 발생하지 않아야 한다 — render 호출이 통과하는 것 자체가 1차 게이트.
// 추가로 placeholder 마커 검증.

describe('Phase 8-1 — 차트 12종 비정상 입력 방어', () => {
  it('LineChart: series 누락 (실제 페이지 다운 케이스) → placeholder', () => {
    // 진단 보고의 실제 깨진 입력: data 사용, series 누락
    const html = renderToStaticMarkup(
      // @ts-expect-error 잘못된 형식 의도 입력
      createElement(LineChart, { title: '잘못된 형식', unit: '%', data: [{ label: '2월' }] }),
    );
    expect(html).toContain(ERROR_MARKER);
    expect(html).toContain('LineChart');
  });

  it('LineChart: series가 객체일 때 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(LineChart, { title: 't', series: { name: 'A' } }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('LineChart: series[].data가 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      createElement(LineChart, {
        title: 't',
        // @ts-expect-error data 누락
        series: [{ name: 'A' }],
      }),
    );
    expect(html).toContain(ERROR_MARKER);
    expect(html).toContain('series[].data');
  });

  it('AreaChart: series 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(AreaChart, { title: 't' }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('HorizontalBarChart: data 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(HorizontalBarChart, { title: 't' }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('DonutChart: data가 문자열 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(DonutChart, { title: 't', data: 'invalid' }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('StackedBarChart: bars 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(StackedBarChart, { title: 't' }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('StackedBarChart: bars[].segments 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      createElement(StackedBarChart, {
        title: 't',
        // @ts-expect-error segments 누락
        bars: [{ label: 'Q1' }],
      }),
    );
    expect(html).toContain(ERROR_MARKER);
    expect(html).toContain('segments');
  });

  it('ScatterPlot: groups 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(ScatterPlot, { title: 't' }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('RangeBarChart: items 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(RangeBarChart, { title: 't' }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('HeatMap: values 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(HeatMap, { title: 't', rows: ['r'], cols: ['c'] }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('HeatMap: rows가 문자열 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(HeatMap, { title: 't', rows: 'invalid', cols: ['c'], values: [[1]] }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('GaugeChart: value 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(GaugeChart, { title: 't' }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('GaugeChart: value=NaN → placeholder', () => {
    const html = renderToStaticMarkup(
      createElement(GaugeChart, { title: 't', value: NaN }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('GaugeChart: value 문자열 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(GaugeChart, { title: 't', value: '50' }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('SparkLine: data 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(SparkLine, { ariaLabel: 'test' }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('DemographicShiftBars: categories 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      createElement(DemographicShiftBars, {
        title: 't',
        leftHeader:  { label: 'L', subLabel: 'l' },
        rightHeader: { label: 'R', subLabel: 'r' },
        // @ts-expect-error categories 누락
      }),
    );
    expect(html).toContain(ERROR_MARKER);
  });

  it('AgeGroupBars: groups 누락 → placeholder', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error
      createElement(AgeGroupBars, { title: 't', beforeLabel: 'B', afterLabel: 'A' }),
    );
    expect(html).toContain(ERROR_MARKER);
  });
});

describe('Phase 8-1 — 정상 입력은 가드 미동작 (회귀 0)', () => {
  it('LineChart 정상 series → placeholder 없음', () => {
    const html = renderToStaticMarkup(
      createElement(LineChart, {
        title: '정상',
        series: [{ name: 'A', data: [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 20 }] }],
      }),
    );
    expect(html).not.toContain(ERROR_MARKER);
  });

  it('GaugeChart 정상 value(0) → placeholder 없음', () => {
    const html = renderToStaticMarkup(
      createElement(GaugeChart, { title: '0%', value: 0 }),
    );
    expect(html).not.toContain(ERROR_MARKER);
  });

  it('HorizontalBarChart 정상 data → placeholder 없음', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '정상',
        data: [{ label: 'A', value: 10 }],
      }),
    );
    expect(html).not.toContain(ERROR_MARKER);
  });

  it('SparkLine 정상 data → placeholder 없음', () => {
    const html = renderToStaticMarkup(
      createElement(SparkLine, { data: [10, 20, 30], ariaLabel: '정상' }),
    );
    expect(html).not.toContain(ERROR_MARKER);
  });
});
