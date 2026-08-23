// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketLive from '../MarketLive';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderCard() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MarketLive />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return host;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('MarketLive', () => {
  it('가짜 시세 표본 대신 로딩 상태를 표시한다', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const card = await renderCard();

    expect(card.textContent).toContain('수도권 84㎡ 실거래 평균');
    expect(card.textContent).not.toContain('국평 시세');
    expect(card.textContent).toContain('불러오는 중');
    expect(card.textContent).not.toContain('25.7억');
  });

  it('최근·직전 30일 표본수와 집계 정의를 노출한다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        rows: [{
          region: '강남구', recentAverage: 200000, recentCount: 3,
          previousAverage: 180000, previousCount: 2, changePct: 11.1,
        }],
        aggregation: { label: '거래 1건당 동일 가중치의 단순 산술평균' },
      }),
    });
    const card = await renderCard();

    expect(card.textContent).toContain('20억');
    expect(card.textContent).toContain('최근 3건 · 직전 2건');
    expect(card.textContent).toContain('전용 80~88㎡');
    expect(card.textContent).toContain('취소 제외');
    expect(card.textContent).toContain('단순 산술평균');
    expect(card.textContent).toContain('일부 지역은 최근 30일 표본이 없어');
  });

  it('정상 0건과 집계 장애를 구분한다', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        rows: [{
          region: '강남구', recentAverage: null, recentCount: 0,
          previousAverage: null, previousCount: 0, changePct: null,
        }],
      }),
    });
    let card = await renderCard();
    expect(card.textContent).toContain('최근 30일 84㎡ 매매 실거래가 없습니다');
    expect(card.textContent).toContain('최근 0건 · 직전 0건');

    await act(async () => root!.unmount());
    root = null;
    host!.remove();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'degraded', rows: [], note: '집계 점검 중' }),
    });
    card = await renderCard();
    expect(card.textContent).toContain('집계 점검 중');
    expect(card.querySelector('[role="alert"]')).not.toBeNull();
  });
});
