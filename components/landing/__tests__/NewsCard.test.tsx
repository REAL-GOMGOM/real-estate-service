// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import NewsCard from '../NewsCard';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderCard() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<NewsCard />);
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

describe('NewsCard', () => {
  it('로딩 중에 실제 뉴스처럼 보이는 하드코딩 표본을 노출하지 않는다', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const card = await renderCard();

    expect(card.textContent).toContain('자동 수집');
    expect(card.textContent).toContain('뉴스를 불러오는 중');
    expect(card.textContent).not.toContain('실거래가지수 3개월 연속 상승');
    expect(card.querySelectorAll('a[target="_blank"]')).toHaveLength(0);
  });

  it('API 장애를 가짜 뉴스로 대체하지 않고 재시도 가능한 오류로 표시한다', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ status: 'unavailable', error: '뉴스 제공처 연결이 원활하지 않습니다.' }),
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        news: [{
          title: '재시도 후 불러온 아파트 뉴스',
          link: 'https://example.com/recovered',
          pubDate: '1시간 전',
          source: '테스트경제',
        }],
      }),
    });
    const card = await renderCard();

    expect(card.querySelector('[role="alert"]')).not.toBeNull();
    expect(card.textContent).toContain('뉴스 제공처 연결');
    expect(card.textContent).toContain('다시 시도');
    expect(card.querySelectorAll('a[target="_blank"]')).toHaveLength(0);

    const retry = [...card.querySelectorAll('button')]
      .find((button) => button.textContent === '다시 시도');
    expect(retry).toBeDefined();
    await act(async () => {
      retry!.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(card.textContent).toContain('재시도 후 불러온 아파트 뉴스');
  });

  it('정상 응답의 제목·출처·게시 시각을 함께 표시한다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        news: [{
          title: '서울 아파트 매매가격 상승폭 확대',
          link: 'https://www.yna.co.kr/view/1',
          pubDate: 'Sun, 09 Aug 2026 12:00:00 +0900',
          pubDateFormatted: '2시간 전',
          source: '연합뉴스',
        }],
      }),
    });
    const card = await renderCard();

    expect(card.textContent).toContain('서울 아파트 매매가격 상승폭 확대');
    expect(card.textContent).toContain('연합뉴스 · 2시간 전');
    const article = card.querySelector('a[target="_blank"]');
    expect(article?.getAttribute('href')).toBe('https://www.yna.co.kr/view/1');
    expect(article?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('정상 0건과 장애를 다른 상태로 표시한다', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'ok', news: [] }) });
    const card = await renderCard();

    expect(card.textContent).toContain('현재 조건에 맞는 새 뉴스가 없습니다');
    expect(card.querySelector('[role="alert"]')).toBeNull();
  });
});
