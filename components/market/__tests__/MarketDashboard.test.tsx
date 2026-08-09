// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import MarketDashboard from '../MarketDashboard';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

const ranking = {
  status: 'partial', period: '최근 3개월', area: 'all', updatedAt: '2026-08-09T00:00:00Z',
  coverage: {
    source: '국토교통부 공개자료', districtCount: 5, transactionCount: 321,
    from: '2026-05-09', toExclusive: '2026-08-10', firstDealDate: '2026-05-09',
    lastDealDate: '2026-08-08', label: '등록 표본 전체 · 5개 시군구',
  },
  topPrice: {
    '등록 표본 전체': [{ rank: 1, aptName: '표본파크', district: '강남구', price: 200000, priceFormatted: '20.0억', area: 84, floor: 12, dealDate: '2026-08-01' }],
  },
  volume: {
    '등록 표본 전체': [{ rank: 1, aptName: '거래파크', district: '강남구', count: 3, avgPriceFormatted: '19.0억' }],
  },
  newHigh: {},
  priceChange: { regions: [], seoulDistricts: [] },
};

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fetchMock.mockImplementation((input: string) => {
    if (input.startsWith('/api/price-change')) return Promise.resolve({
      ok: true, status: 200, json: async () => ({
        period: '2026.07', frequency: 'monthly', type: 'sale',
        summary: { nationwide: 0.1, capital_area: 0.2, non_capital: 0 },
        regions: [{ code: '11', name: '서울', change_rate: 0.3, direction: 'up' }],
      }),
    });
    if (input.startsWith('/api/ranking')) return Promise.resolve({ ok: true, status: 200, json: async () => ranking });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ rate: 2.5, period: '2026.07', name: 'COFIX' }) });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('MarketDashboard ranking summary', () => {
  it('전국으로 과장하지 않고 등록 표본 범위와 부분 집계를 표시한다', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<MarketDashboard />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.textContent).toContain('표본 최고가');
    expect(host.textContent).toContain('등록 표본의 최근 3개월 주목 거래');
    expect(host.textContent).toContain('랭킹 부가 지표가 부분 집계');
    expect(host.textContent).toContain('321건');
    expect(host.textContent).not.toContain('최고가 거래');
  });
});
