// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/layout/Header', () => ({ default: () => <header>테스트 헤더</header> }));

import NewsPage from '../page';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderPage() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<NewsPage />);
    await Promise.resolve();
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

describe('NewsPage', () => {
  it('자동 수집·미검증 범위를 투명하게 고지하고 출처를 표시한다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        fetchedAt: '2026-08-09T03:00:00.000Z',
        news: [{
          title: '서울 아파트 전세가격 상승',
          link: 'https://www.hankyung.com/realestate/1',
          pubDate: 'Sun, 09 Aug 2026 11:00:00 +0900',
          pubDateFormatted: '1시간 전',
          source: '한국경제',
          category: 'realestate',
          thumbnail: null,
        }],
      }),
    });
    const page = await renderPage();

    expect(page.textContent).toContain('자동 수집');
    expect(page.textContent).toContain('편집자가 각 기사의 정확성을 개별 검증');
    expect(page.textContent).not.toContain('선별하여 엄선');
    expect(page.textContent).toContain('출처 한국경제');
    expect(page.querySelector('a[target="_blank"]')?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('API 장애를 뉴스 0건으로 오인하게 하지 않는다', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ status: 'unavailable', news: [], error: '뉴스 제공처 연결이 원활하지 않습니다.' }),
    });
    const page = await renderPage();

    expect(page.querySelector('[role="alert"]')).not.toBeNull();
    expect(page.textContent).toContain('뉴스 제공처 연결');
    expect(page.textContent).not.toContain('현재 조건에 맞는 새 뉴스가 없습니다');
  });
});
