// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import NotableDealsCard from '../NotableDealsCard';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderCard() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<NotableDealsCard />);
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
  if (root) {
    await act(async () => root!.unmount());
  }
  root = null;
  host = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('NotableDealsCard', () => {
  it('로딩 중에 실거래처럼 보이는 표본을 노출하지 않는다', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const card = await renderCard();

    expect(card.textContent).toContain('특이 실거래를 불러오는 중');
    expect(card.textContent).not.toContain('아크로리버파크');
    expect(card.textContent).not.toContain('47.5억');
  });

  it('1~3건의 정상 부분 응답을 실제 건수대로 표시한다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        newHighs: [{
          district: '강남구', apt: '테스트파크', area: 84, floor: 12,
          price: 200000, date: '2026-08-01', prevHigh: 190000,
        }],
        surges: [],
        pyeong84: [],
      }),
    });
    const card = await renderCard();

    expect(card.textContent).toContain('테스트파크');
    expect(card.textContent).toContain('20억');
    expect(card.textContent).toContain('현재 집계된 1건만 표시');
    expect(card.querySelectorAll('.nz-notable a')).toHaveLength(1);
  });

  it('한 카테고리만 있어도 실제 응답 4건까지 보충한다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        newHighs: [],
        surges: [1, 2, 3, 4].map((n) => ({
          district: '강남구', apt: `급등단지${n}`, area: 84, floor: n,
          price: 200000 + n, date: '2026-08-01', prevPrice: 190000, ratePct: n,
        })),
        pyeong84: [],
      }),
    });
    const card = await renderCard();

    expect(card.querySelectorAll('.nz-notable a')).toHaveLength(4);
    expect(card.textContent).toContain('급등단지4');
    expect(card.textContent).not.toContain('현재 집계된');
  });

  it('정상 0건과 장애를 다른 상태로 표시한다', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', newHighs: [], surges: [], pyeong84: [] }),
    });
    let card = await renderCard();
    expect(card.textContent).toContain('조건에 맞는 특이 실거래가 없습니다');

    await act(async () => root!.unmount());
    root = null;
    host!.remove();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'degraded', note: '서버 점검 중' }),
    });
    card = await renderCard();
    expect(card.textContent).toContain('서버 점검 중');
    expect(card.querySelector('[role="alert"]')).not.toBeNull();
    expect(card.textContent).toContain('다시 시도');
  });
});
