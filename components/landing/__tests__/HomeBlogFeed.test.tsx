// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import HomeBlogFeed from '../HomeBlogFeed';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderFeed() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<HomeBlogFeed />);
    await settle();
  });
  return host;
}

function apiResponse(ok: boolean, body: unknown): Response {
  return { ok, json: async () => body } as Response;
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

describe('HomeBlogFeed', () => {
  it('로딩 중 가짜 칼럼 제목을 노출하지 않는다', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const feed = await renderFeed();

    expect(feed.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(feed.textContent).not.toContain('서울 집값 상승');
    expect(fetchMock).toHaveBeenCalledWith('/api/blog/feed', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('검증된 API 글만 상세 링크로 표시한다', async () => {
    fetchMock.mockResolvedValue(apiResponse(true, {
      status: 'ok',
      data: [{
        slug: 'verified-post',
        title: '검증된 칼럼',
        publishedAt: '2026-08-01T00:00:00.000Z',
        categoryName: '시장',
      }],
    }));
    const feed = await renderFeed();

    expect(feed.textContent).toContain('검증된 칼럼');
    expect(feed.textContent).toContain('08.01');
    expect(feed.querySelector('a')?.getAttribute('href')).toBe('/blog/verified-post');
  });

  it('UTC 발행 시각을 한국 날짜로 표시한다', async () => {
    fetchMock.mockResolvedValue(apiResponse(true, {
      status: 'ok',
      data: [{
        slug: 'kst-date-post',
        title: '한국 날짜 칼럼',
        publishedAt: '2026-08-01T15:30:00.000Z',
        categoryName: '시장',
      }],
    }));
    const feed = await renderFeed();

    expect(feed.textContent).toContain('08.02');
    expect(feed.textContent).not.toContain('08.01');
  });

  it('DB 장애를 빈 목록으로 위장하지 않고 재시도한다', async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse(false, { status: 'unavailable' }))
      .mockResolvedValueOnce(apiResponse(true, { status: 'ok', data: [] }));
    const feed = await renderFeed();

    expect(feed.textContent).toContain('칼럼 목록을 잠시 불러오지 못했습니다');
    const retry = [...feed.querySelectorAll('button')].find((button) => button.textContent === '다시 시도');
    expect(retry).toBeDefined();

    await act(async () => {
      retry!.click();
      await settle();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(feed.textContent).toContain('아직 발행된 칼럼이 없습니다');
  });
});
