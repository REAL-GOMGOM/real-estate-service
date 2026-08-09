// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/share-image', () => ({
  buildRankingShareImage: vi.fn(),
  shareOrDownloadImage: vi.fn(),
}));

vi.mock('@/components/shared/SaveImageButton', () => ({
  SaveImageButton: () => <button type="button">이미지 저장</button>,
}));

import RankingClientPage from '../RankingClientPage';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function rankingResponse(aptName = '테스트파크', status: 'ok' | 'partial' = 'ok') {
  const topPrice = [{
    rank: 1, aptName, district: '강남구', dong: '대치동', price: 200000,
    priceFormatted: '20.0억', area: 84, pyeong: 25, floor: 12, dealDate: '2026-08-01',
  }];
  const volume = [{
    rank: 1, aptName, district: '강남구', dong: '대치동', count: 3,
    avgPrice: 190000, avgPriceFormatted: '19.0억',
  }];
  const newHigh = [{
    rank: 1, aptName, district: '강남구', dong: '대치동', price: 200000,
    prevHigh: 190000, diffPercent: 5.3, diffFormatted: '+1.0억',
  }];
  return {
    status,
    period: '최근 3개월',
    area: 'all',
    updatedAt: '2026-08-09T03:00:00.000Z',
    coverage: {
      source: '국토교통부 공개자료를 적재한 내집 실거래 원장',
      districtCount: 5,
      transactionCount: 321,
      from: '2026-05-09',
      toExclusive: '2026-08-10',
      firstDealDate: '2026-05-09',
      lastDealDate: '2026-08-08',
      label: '등록 표본 전체 · 5개 시군구',
    },
    topPrice: { '등록 표본 전체': topPrice, '서울특별시': topPrice },
    volume: { '등록 표본 전체': volume, '서울특별시': volume },
    newHigh: { '등록 표본 전체': newHigh, '서울특별시': newHigh },
    priceChange: { regions: [], seoulDistricts: [] },
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderPage() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<RankingClientPage />));
  await flush();
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

describe('RankingClientPage', () => {
  it('표본 범위와 부분 집계를 명시하고 전국·주간·달러 표현을 노출하지 않는다', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => rankingResponse('확인아파트', 'partial') });
    const page = await renderPage();

    expect(page.textContent).toContain('실거래 랭킹');
    expect(page.textContent).toContain('일부 지표 미집계');
    expect(page.textContent).toContain('등록 표본 전체');
    expect(page.textContent).toContain('실거래 321건');
    expect(page.textContent).toContain('2026.05.09 이상 ~ 2026.08.10 미만');
    expect(page.textContent).toContain('확인아파트');
    expect(page.textContent).not.toContain('주간');
    expect(page.textContent).not.toContain('$');
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('HTTP 200이어도 상태 계약이 틀리면 오류로 표시한다', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...rankingResponse(), status: 'degraded' }),
    });
    const page = await renderPage();

    expect(page.textContent).toContain('랭킹 데이터를 불러올 수 없습니다');
    expect(page.textContent).toContain('다시 시도');
  });

  it('필터가 바뀐 후 이전 요청의 느린 응답을 반영하지 않는다', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => rankingResponse('최신응답') });
    const page = await renderPage();
    const yearButton = Array.from(page.querySelectorAll('button'))
      .find((button) => button.textContent === '최근 1년');
    expect(yearButton).toBeDefined();

    await act(async () => yearButton!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await flush();
    expect(page.textContent).toContain('최신응답');

    resolveFirst?.({ ok: true, status: 200, json: async () => rankingResponse('이전응답') });
    await flush();
    expect(page.textContent).toContain('최신응답');
    expect(page.textContent).not.toContain('이전응답');
  });
});
