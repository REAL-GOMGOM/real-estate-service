// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerReplace = vi.hoisted(() => vi.fn());
const trackAnalyticsEvent = vi.hoisted(() => vi.fn());
const routeQuery = vi.hoisted(() => ({
  value: 'q=잠실&months=6&dealType=jeonse&tx=old&rtx=old',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(routeQuery.value),
}));
vi.mock('@/lib/cookie-consent', () => ({ trackAnalyticsEvent }));

import GlobalApartmentSearchResults from '../GlobalApartmentSearchResults';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  routerReplace.mockReset();
  trackAnalyticsEvent.mockReset();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok: true,
    json: async () => ({
      results: [{
        id: 'A11710101',
        name: '잠실엘스',
        sido: '서울특별시',
        sigungu: '송파구',
        dong: '잠실동',
        lawdCd: '11710',
      }],
    }),
  })));
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
});

describe('GlobalApartmentSearchResults', () => {
  it('기존 기간·거래유형을 보존하고 계약 딥링크를 제거한 정확 단지 URL로 이동한다', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<GlobalApartmentSearchResults query="잠실" />);
      await settle();
    });

    const result = [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('잠실엘스'));
    expect(result).toBeDefined();
    await act(async () => {
      result!.click();
      await settle();
    });

    expect(routerReplace).toHaveBeenCalledWith(
      '/transactions?q=%EC%9E%A0%EC%8B%A4%EC%97%98%EC%8A%A4&months=6&dealType=jeonse&district=%EC%86%A1%ED%8C%8C%EA%B5%AC&aptId=A11710101&aptDong=%EC%9E%A0%EC%8B%A4%EB%8F%99',
      { scroll: false },
    );
    expect(trackAnalyticsEvent).toHaveBeenCalledWith(
      'transaction_apartment_search_select',
      {
        apartment_id: 'A11710101',
        district: '송파구',
        source: 'transactions_query_results',
      },
    );
  });
});
