// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PriceMapPage from '../page';

vi.mock('@/components/layout/Header', () => ({ default: () => null }));

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderPage() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<PriceMapPage />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return host;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
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

describe('PriceMapContent', () => {
  it('월간만 요청·표시하고 서버 오류를 재시도 가능한 상태로 보여준다', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: '월간 집계 점검 중입니다.' }),
    });

    const page = await renderPage();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/price-change?type=sale&period=monthly',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(page.textContent).toContain('월간');
    expect(page.textContent).not.toContain('주간');
    expect(page.textContent).toContain('월간 집계 점검 중입니다.');
    expect(page.querySelector('[role="alert"]')).not.toBeNull();

    const retry = [...page.querySelectorAll('button')]
      .find((button) => button.textContent === '다시 시도');
    expect(retry).toBeDefined();
    await act(async () => {
      retry!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('frequency가 없는 월간처럼 보이는 응답을 표시하지 않는다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        period: '2026년 7월',
        type: 'sale',
        summary: { nationwide: 0, capital_area: 0, non_capital: 0 },
        regions: [{ code: '11', name: '서울', change_rate: 0.1, direction: 'up' }],
      }),
    });

    const page = await renderPage();

    expect(page.textContent).toContain('월간 변동률 응답 형식이 올바르지 않습니다.');
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
  });
});
