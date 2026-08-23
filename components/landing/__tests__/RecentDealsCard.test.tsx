// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import RecentDealsCard from '../RecentDealsCard';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderCard() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<RecentDealsCard />);
    await settle();
  });
  return host;
}

function apiResponse(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function validGroup(name = '실제 검증 단지') {
  return {
    name,
    dong: '대치동',
    transactions: [{
      dong: '대치동',
      area: 84,
      floor: 12,
      price: 205000,
      date: '2026-08-03',
    }],
  };
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

describe('RecentDealsCard', () => {
  it('로딩 중에 하드코딩 실거래 표본을 노출하지 않는다', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const card = await renderCard();

    expect(card.textContent).toContain('최근 실거래를 불러오는 중');
    expect(card.textContent).not.toContain('래미안 대치팰리스');
    expect(card.textContent).not.toContain('34.5억');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=2&limit=60',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('API 오류를 표본으로 덮지 않고 재시도 후 실제 응답만 표시한다', async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse(false, 503, { error: '실거래 원천 점검 중입니다.' }))
      .mockResolvedValueOnce(apiResponse(true, 200, { data: [validGroup()] }));
    const card = await renderCard();

    expect(card.querySelector('[role="alert"]')).not.toBeNull();
    expect(card.textContent).toContain('실거래 원천 점검 중입니다.');
    expect(card.textContent).not.toContain('은마아파트');
    expect(card.textContent).not.toContain('26.8억');

    const retry = [...card.querySelectorAll('button')]
      .find((button) => button.textContent === '다시 시도');
    expect(retry).toBeDefined();
    expect(retry?.getAttribute('type')).toBe('button');
    await act(async () => {
      retry!.click();
      await settle();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(card.textContent).toContain('실제 검증 단지');
    expect(card.textContent).toContain('20.5억');
    expect(card.textContent).toContain('대치동 · 전용 84㎡ · 12층');
    expect(card.textContent).toContain('08.03');
    expect(card.querySelector('[role="alert"]')).toBeNull();
  });

  it('정상 0건과 일부 손상된 응답을 서로 다른 상태로 표시한다', async () => {
    fetchMock.mockResolvedValueOnce(apiResponse(true, 200, { data: [] }));
    let card = await renderCard();
    expect(card.textContent).toContain('최근 2개월에 확인된 강남구 매매 실거래가 없습니다');
    expect(card.querySelector('[role="alert"]')).toBeNull();

    await act(async () => root!.unmount());
    root = null;
    host!.remove();

    fetchMock.mockResolvedValueOnce(apiResponse(true, 200, {
      data: [
        validGroup('부분 검증 단지'),
        { name: '손상 단지', transactions: [{ area: '84', price: null }] },
      ],
    }));
    card = await renderCard();
    expect(card.querySelector('[role="alert"]')).not.toBeNull();
    expect(card.textContent).toContain('일부 거래를 확인하지 못해 검증된 거래만 표시');
    expect(card.textContent).toContain('부분 검증 단지');
    expect(card.textContent).not.toContain('손상 단지');
  });

  it('지역을 바꾸면 이전 요청을 중단하고 선택 상태를 알린다', async () => {
    fetchMock
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(apiResponse(true, 200, { data: [validGroup('서초 실제 단지')] }));
    const card = await renderCard();
    const firstSignal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    const seocho = [...card.querySelectorAll('button')]
      .find((button) => button.textContent === '서초구');
    expect(seocho).toBeDefined();

    await act(async () => {
      seocho!.click();
      await settle();
    });

    expect(firstSignal.aborted).toBe(true);
    expect(seocho?.getAttribute('aria-pressed')).toBe('true');
    expect(card.textContent).toContain('서초 실제 단지');
    expect(fetchMock.mock.calls[1][0]).toContain('district=%EC%84%9C%EC%B4%88%EA%B5%AC');
  });
});
