import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { HorizontalBarChart } from '../HorizontalBarChart';

/**
 * 사이클 P Step P-1 dev warn 3종 검증.
 *
 * 명세상 @testing-library/react `render` 패턴이지만 미설치 → renderToStaticMarkup으로 대체.
 * dev warn은 컴포넌트 함수 본문(useEffect 밖)에 위치하므로 SSR 호출만으로 코드 path 도달.
 */

describe('HorizontalBarChart dev warn', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    warnSpy.mockRestore();
  });

  describe('(a) unit 미지정 + title에 "(단위: X)" 포함', () => {
    it('경고 발생 — 단위 추출 + fix 예시 포함', () => {
      renderToStaticMarkup(
        createElement(HorizontalBarChart, {
          title: '총가구 수 추이 (단위: 만 가구)',
          data: [{ label: '2022', value: 2166, color: 'gray' }],
        }),
      );
      const calls = warnSpy.mock.calls.flat();
      expect(calls.some((c) => typeof c === 'string' && c.includes('단위: 만 가구'))).toBe(true);
      expect(calls.some((c) => typeof c === 'string' && c.includes('unit="만 가구"'))).toBe(true);
    });

    it('unit 명시 시 경고 없음', () => {
      renderToStaticMarkup(
        createElement(HorizontalBarChart, {
          title: '총가구 수 추이 (단위: 만 가구)',
          unit: '만 가구',
          data: [{ label: '2022', value: 2166, color: 'gray' }],
        }),
      );
      const calls = warnSpy.mock.calls.flat();
      expect(calls.some((c) => typeof c === 'string' && c.includes('단위: 만 가구'))).toBe(false);
    });

    it('title에 "단위:" 패턴 없으면 경고 없음', () => {
      renderToStaticMarkup(
        createElement(HorizontalBarChart, {
          title: '2025년 변동률',
          data: [{ label: '서울', value: 11.3, color: 'red' }],
        }),
      );
      const calls = warnSpy.mock.calls.flat();
      expect(calls.some((c) => typeof c === 'string' && c.includes('단위:'))).toBe(false);
    });
  });

  describe('(b) dividerText가 단위 문자열 + unit 미지정', () => {
    it('"억" 같은 짧은 한글 단위 → 경고 발생', () => {
      renderToStaticMarkup(
        createElement(HorizontalBarChart, {
          title: '호반서밋 청약',
          dividerText: '억',
          data: [{ label: '계약금', value: 2.07, color: 'orange' }],
        }),
      );
      const calls = warnSpy.mock.calls.flat();
      expect(calls.some((c) => typeof c === 'string' && c.includes('dividerText="억"'))).toBe(true);
    });

    it('"%" 단일 dividerText → 경고 발생 (tax-reform 패턴)', () => {
      renderToStaticMarkup(
        createElement(HorizontalBarChart, {
          title: '세율 변동',
          dividerText: '%',
          data: [{ label: '서울', value: 33, color: 'red' }],
        }),
      );
      const calls = warnSpy.mock.calls.flat();
      expect(calls.some((c) => typeof c === 'string' && c.includes('dividerText="%"'))).toBe(true);
    });

    it('긴 설명형 dividerText는 경고 없음', () => {
      renderToStaticMarkup(
        createElement(HorizontalBarChart, {
          title: '자치구 변동률',
          dividerText: '↕ 같은 수도권 안에서 30%p 격차 ↕',
          data: [{ label: '송파', value: 24.0, color: 'red' }],
        }),
      );
      const calls = warnSpy.mock.calls.flat();
      expect(calls.some((c) => typeof c === 'string' && c.includes('dividerText='))).toBe(false);
    });

    it('unit 명시 시 dividerText 경고 없음', () => {
      renderToStaticMarkup(
        createElement(HorizontalBarChart, {
          title: '호반서밋',
          unit: '억',
          dividerText: '억',
          data: [{ label: '계약금', value: 2.07, color: 'orange' }],
        }),
      );
      const calls = warnSpy.mock.calls.flat();
      expect(calls.some((c) => typeof c === 'string' && c.includes('dividerText="억"'))).toBe(false);
    });
  });

  describe('(c) discrete 모드 + 모든 row color 미지정', () => {
    it('경고 발생 — gradient 또는 row.color 권장', () => {
      renderToStaticMarkup(
        createElement(HorizontalBarChart, {
          title: 'M2 광의통화',
          data: [
            { label: '2020', value: 3000 },
            { label: '2022', value: 3700 },
          ],
        }),
      );
      const calls = warnSpy.mock.calls.flat();
      expect(calls.some((c) => typeof c === 'string' && c.includes('모든 row의 color가 미지정'))).toBe(true);
    });

    it('일부 row만 color 명시 → 경고 없음 (every가 false)', () => {
      renderToStaticMarkup(
        createElement(HorizontalBarChart, {
          title: '혼재',
          data: [
            { label: 'A', value: 10, color: 'red' },
            { label: 'B', value: 20 },
          ],
        }),
      );
      const calls = warnSpy.mock.calls.flat();
      expect(calls.some((c) => typeof c === 'string' && c.includes('모든 row의 color가 미지정'))).toBe(false);
    });

    it('colorMode="gradient" + 모든 row color 미지정 → 경고 없음 (의도된 패턴)', () => {
      renderToStaticMarkup(
        createElement(HorizontalBarChart, {
          title: '서울 자치구',
          colorMode: 'gradient',
          data: [
            { label: '송파', value: 24.0 },
            { label: '강남', value: 21.0 },
          ],
        }),
      );
      const calls = warnSpy.mock.calls.flat();
      expect(calls.some((c) => typeof c === 'string' && c.includes('모든 row의 color가 미지정'))).toBe(false);
    });
  });
});
