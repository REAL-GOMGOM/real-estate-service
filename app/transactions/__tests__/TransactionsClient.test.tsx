// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeQuery = vi.hoisted(() => ({ value: '' }));
const routerReplace = vi.hoisted(() => vi.fn());
const routerPrefetch = vi.hoisted(() => vi.fn());
const trackAnalyticsEvent = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, prefetch: routerPrefetch }),
  useSearchParams: () => new URLSearchParams(routeQuery.value),
}));
vi.mock('@/components/layout/Header', () => ({ default: () => null }));
vi.mock('@/lib/cookie-consent', () => ({ trackAnalyticsEvent }));
vi.mock('@/components/search/AptAutocomplete', () => ({
  AptAutocomplete: ({
    ariaLabel,
    initialValue,
    onClear,
    onSelect,
  }: {
    ariaLabel?: string;
    initialValue?: string;
    onClear?: () => void;
    onSelect: (apartment: {
      id: string;
      name: string;
      sido: string;
      sigungu: string;
      dong: string;
      lawdCd: string;
    }) => void;
  }) => (
    <div>
      <input
        readOnly
        role="combobox"
        aria-label={ariaLabel}
        aria-controls="mock-apartment-results"
        aria-expanded="false"
        value={initialValue ?? ''}
      />
      <button
        type="button"
        onClick={() => onSelect({
          id: 'A11710101',
          name: '잠실엘스',
          sido: '서울특별시',
          sigungu: '송파구',
          dong: '잠실동',
          lawdCd: '11710',
        })}
      >
        잠실엘스 선택
      </button>
      {initialValue && (
        <button type="button" onClick={onClear}>검색어 지우기</button>
      )}
    </div>
  ),
}));
vi.mock('@/components/shared/AnalysisPromoBar', () => ({ AnalysisPromoBar: () => null }));
vi.mock('@/components/ads/CoupangBanner', () => ({
  default: ({ subId }: { subId: string }) => <div data-testid="coupang-banner" data-sub-id={subId} />,
}));
vi.mock('../components/AptCard', () => ({
  default: ({ apt }: { apt: { name: string } }) => <div data-testid="apt-card">{apt.name}</div>,
}));
vi.mock('../components/RentAptCard', () => ({
  default: ({ apt }: { apt: { name: string } }) => <div data-testid="rent-card">{apt.name}</div>,
}));
vi.mock('../components/AptDetailModal', () => ({ default: () => null }));
vi.mock('../components/RentAptDetailModal', () => ({ default: () => null }));
vi.mock('../components/RegionPickerModal', () => ({
  default: ({ initialLabel, onPick }: { initialLabel: string; onPick: (district: string) => void }) => (
    <div role="dialog" aria-label="지역 선택">
      <span>{initialLabel}</span>
      <button type="button" onClick={() => onPick('강남구')}>강남구 선택</button>
    </div>
  ),
}));
vi.mock('../components/DistrictChips', () => ({
  default: ({ onPick }: { onPick: (district: string) => void }) => (
    <button type="button" onClick={() => onPick('서초구')}>서초구 칩</button>
  ),
}));
vi.mock('../components/GlobalApartmentSearchResults', () => ({ default: () => null }));

import TransactionsClient from '../TransactionsClient';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderClient(query: string) {
  routeQuery.value = query;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<TransactionsClient />);
    await settle();
  });
  return host;
}

function response(ok: boolean, body: unknown) {
  return Promise.resolve({ ok, json: async () => body });
}

function findButton(page: HTMLElement, label: string) {
  return [...page.querySelectorAll('button')].find((button) => button.textContent?.trim() === label);
}

const rentGroup = {
  id: 'rent-apt',
  name: '재시도 전세 단지',
  district: '강남구',
  dong: '대치동',
  buildYear: 2020,
  areas: [84],
  txCount: 1,
  transactions: [{
    aptName: '재시도 전세 단지', district: '강남구', dong: '대치동', area: 84, floor: 10,
    deposit: 80_000, monthlyRent: 0, date: '2026-08-01', buildYear: 2020,
    contractType: '신규', prevDeposit: null, prevMonthlyRent: null,
  }],
};

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  fetchMock.mockReset();
  routerReplace.mockReset();
  routerReplace.mockImplementation((href: string) => {
    routeQuery.value = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
  });
  routerPrefetch.mockReset();
  trackAnalyticsEvent.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('TransactionsClient retry behavior', () => {
  it('집계가 저하되면 재시도를 유지하면서 지역 선택으로 상세 조회를 계속할 수 있다', async () => {
    let summaryAttempts = 0;
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/summary')) {
        summaryAttempts += 1;
        return response(true, {
          status: 'degraded',
          summary: [],
          note: '집계 데이터 일시 점검 중입니다.',
        });
      }
      if (url.startsWith('/api/transactions?')) return response(true, { data: [] });
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient('');
    expect(summaryAttempts).toBe(1);
    expect(page.textContent).toContain('실거래 집계를 불러오지 못했어요');
    expect(page.textContent).not.toContain('0건');

    const retry = findButton(page, '다시 시도');
    expect(retry).toBeDefined();
    await act(async () => {
      retry!.click();
      await settle();
    });
    expect(summaryAttempts).toBe(2);

    const selectRegion = findButton(page, '지역 선택');
    expect(selectRegion).toBeDefined();
    await act(async () => {
      selectRegion!.click();
      await settle();
    });
    expect(page.querySelector('[role="dialog"][aria-label="지역 선택"]')).not.toBeNull();

    const selectGangnam = findButton(page, '강남구 선택');
    expect(selectGangnam).toBeDefined();
    await act(async () => {
      selectGangnam!.click();
      await settle();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transactions?months=2&district=%EA%B0%95%EB%82%A8%EA%B5%AC',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(page.textContent).toContain('지역 변경');
  });

  it('최초 전월세 요청 실패 후 같은 조건으로 다시 조회한다', async () => {
    let rentAttempts = 0;
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/rent?')) {
        rentAttempts += 1;
        return rentAttempts === 1
          ? response(false, { error: 'temporary rent failure' })
          : response(true, { data: [rentGroup] });
      }
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient('district=강남구&dealType=jeonse');
    expect(rentAttempts).toBe(1);
    expect(page.querySelector('[role="alert"]')).not.toBeNull();

    const retry = findButton(page, '다시 시도');
    expect(retry).toBeDefined();
    await act(async () => {
      retry!.click();
      await settle();
    });

    expect(rentAttempts).toBe(2);
    expect(page.textContent).toContain('재시도 전세 단지');
  });

  it('최초 분양권 요청 실패 후 같은 조건으로 다시 조회한다', async () => {
    let silvAttempts = 0;
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/silv?')) {
        silvAttempts += 1;
        return silvAttempts === 1
          ? response(false, { error: 'temporary presale failure' })
          : response(true, { data: [{ id: 'silv-apt', name: '재시도 분양권 단지', transactions: [] }] });
      }
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient('district=강남구&dealType=bunyang');
    expect(silvAttempts).toBe(1);
    expect(page.querySelector('[role="alert"]')).not.toBeNull();

    const retry = findButton(page, '다시 시도');
    expect(retry).toBeDefined();
    await act(async () => {
      retry!.click();
      await settle();
    });

    expect(silvAttempts).toBe(2);
    expect(page.textContent).toContain('재시도 분양권 단지');
  });

  it('전월세 데이터를 불러온 뒤 분양권으로 전환해도 전월세 통계 바를 숨긴다', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/rent?')) return response(true, { data: [rentGroup] });
      if (url.startsWith('/api/transactions/silv?')) return response(true, { data: [] });
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient('district=강남구&dealType=jeonse');
    expect(page.querySelector('select[aria-label="전월세 정렬"]')).not.toBeNull();

    const presaleTab = findButton(page, '분양권');
    expect(presaleTab).toBeDefined();
    await act(async () => {
      presaleTab!.click();
      await settle();
    });

    expect(page.querySelector('select[aria-label="전월세 정렬"]')).toBeNull();
  });

  it('일부 월만 성공한 응답은 부분 집계임을 알린다', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/rent?')) {
        return response(true, { data: [rentGroup], status: 'partial', failedMonths: ['202607'] });
      }
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient('district=강남구&dealType=jeonse');

    expect(page.textContent).toContain('현재 목록과 건수는 부분 집계입니다');
  });
});

describe('TransactionsClient apartment search', () => {
  it('요약 상단에서 고른 정확 단지를 URL에 반영하고 상세 조회로 바로 전환한다', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/summary')) {
        return response(true, {
          status: 'healthy',
          summary: [{
            label: '서울', estimatedCount: 1, newHighs: 0,
            avg59: 80_000, avg84: 120_000, firstDistrict: '강남구',
          }],
          daily: null,
        });
      }
      if (url === '/api/transactions?months=2&aptId=A11710101') {
        return response(true, {
          data: [{
            id: '잠실엘스', masterId: 'A11710101', name: '잠실엘스',
            district: '송파구', dong: '잠실동', buildYear: 2008,
            areas: [84], transactions: [],
          }],
        });
      }
      if (url.startsWith('/api/transactions?months=2&district=')) {
        return response(true, { data: [] });
      }
      if (url.startsWith('/api/transactions/districts?')) {
        return response(true, { districts: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient('');
    expect(page.querySelectorAll('[role="combobox"][aria-label="전국 아파트 단지 검색"]')).toHaveLength(1);

    const selectApartment = findButton(page, '잠실엘스 선택');
    expect(selectApartment).toBeDefined();
    await act(async () => {
      selectApartment!.click();
      await settle();
    });

    expect(routerReplace).toHaveBeenCalledWith(
      '/transactions?district=%EC%86%A1%ED%8C%8C%EA%B5%AC&q=%EC%9E%A0%EC%8B%A4%EC%97%98%EC%8A%A4&aptId=A11710101&months=2&aptDong=%EC%9E%A0%EC%8B%A4%EB%8F%99',
      { scroll: false },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transactions?months=2&aptId=A11710101',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(trackAnalyticsEvent).toHaveBeenCalledWith(
      'transaction_apartment_search_select',
      {
        apartment_id: 'A11710101',
        district: '송파구',
        source: 'transactions_top',
      },
    );
    expect(page.textContent).toContain('송파구');
    expect(page.querySelectorAll('[role="combobox"][aria-label="전국 아파트 단지 검색"]')).toHaveLength(1);
  });

  it('상세 화면에서도 상단 검색을 하나만 제공하고 지우면 현재 지역 전체 조회로 돌아간다', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions?')) return response(true, { data: [] });
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient(
      'district=강남구&q=래미안대치팰리스&aptId=A11680101&aptDong=대치동&months=6',
    );
    expect(page.querySelectorAll('[role="combobox"][aria-label="전국 아파트 단지 검색"]')).toHaveLength(1);
    expect((page.querySelector('[role="combobox"]') as HTMLInputElement).value).toBe('래미안대치팰리스');

    const clear = findButton(page, '검색어 지우기');
    expect(clear).toBeDefined();
    await act(async () => {
      clear!.click();
      await settle();
    });

    expect(routerReplace).toHaveBeenCalledWith(
      '/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=6',
      { scroll: false },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transactions?months=6&district=%EA%B0%95%EB%82%A8%EA%B5%AC',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('지역·기간·거래유형·전체보기 상태를 URL에 함께 반영한다', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/summary')) {
        return response(true, {
          status: 'healthy',
          summary: [{
            label: '서울', estimatedCount: 1, newHighs: 0,
            avg59: 80_000, avg84: 120_000, firstDistrict: '강남구',
          }],
          daily: null,
        });
      }
      if (url.startsWith('/api/transactions/rent?')) return response(true, { data: [rentGroup] });
      if (url.startsWith('/api/transactions?')) return response(true, { data: [] });
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient(
      'district=강남구&q=래미안대치팰리스&aptId=A11680101&aptDong=대치동&months=6',
    );

    await act(async () => {
      findButton(page, '3년')!.click();
      await settle();
    });
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&q=%EB%9E%98%EB%AF%B8%EC%95%88%EB%8C%80%EC%B9%98%ED%8C%B0%EB%A6%AC%EC%8A%A4&aptId=A11680101&aptDong=%EB%8C%80%EC%B9%98%EB%8F%99&months=36',
      { scroll: false },
    );

    await act(async () => {
      findButton(page, '전세')!.click();
      await settle();
    });
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&q=%EB%9E%98%EB%AF%B8%EC%95%88%EB%8C%80%EC%B9%98%ED%8C%B0%EB%A6%AC%EC%8A%A4&aptId=A11680101&aptDong=%EB%8C%80%EC%B9%98%EB%8F%99&months=36&dealType=jeonse',
      { scroll: false },
    );

    await act(async () => {
      findButton(page, '서초구 칩')!.click();
      await settle();
    });
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/transactions?district=%EC%84%9C%EC%B4%88%EA%B5%AC&months=36&dealType=jeonse',
      { scroll: false },
    );

    await act(async () => {
      findButton(page, '← 전체 보기')!.click();
      await settle();
    });
    expect(routerReplace).toHaveBeenLastCalledWith(
      '/transactions?months=36&dealType=jeonse',
      { scroll: false },
    );
    expect(page.textContent).toContain('시/도별 거래 현황');
  });

  it('라우터 반영 전 연속 필터 변경도 직전 URL 변경을 덮지 않는다', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/rent?')) return response(true, { data: [rentGroup] });
      if (url.startsWith('/api/transactions?')) return response(true, { data: [] });
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient('district=강남구&months=6');
    // 실제 라우터의 비동기 반영 지연을 재현한다.
    routerReplace.mockImplementation(() => undefined);

    await act(async () => {
      findButton(page, '3년')!.click();
      await settle();
    });
    await act(async () => {
      findButton(page, '전세')!.click();
      await settle();
    });

    expect(routerReplace).toHaveBeenLastCalledWith(
      '/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=36&dealType=jeonse',
      { scroll: false },
    );
  });

  it('같은 화면의 URL이 바뀌면 이전 검색을 남기지 않고 모든 조회 상태를 복원한다', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/rent?')) return response(true, { data: [rentGroup] });
      if (url.startsWith('/api/transactions?')) return response(true, { data: [] });
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient(
      'district=강남구&q=이전단지&aptId=A-OLD&aptDong=대치동&months=6',
    );
    routeQuery.value = 'district=서초구&months=3&dealType=monthly';
    await act(async () => {
      root!.render(<TransactionsClient />);
      await settle();
    });

    expect((page.querySelector('[role="combobox"]') as HTMLInputElement).value).toBe('');
    expect(findButton(page, '3개월')?.getAttribute('aria-pressed')).toBe('true');
    expect(findButton(page, '월세')?.getAttribute('aria-pressed')).toBe('true');
    expect(page.textContent).toContain('서초구');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transactions/rent?district=%EC%84%9C%EC%B4%88%EA%B5%AC&months=3&rentType=monthly',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('전월세 빈 결과의 필터 초기화가 선택 단지와 URL을 함께 해제한다', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/rent?')) return response(true, { data: [rentGroup] });
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient(
      'district=강남구&q=없는단지&aptId=A-NONE&aptDong=대치동&months=2&dealType=jeonse',
    );
    expect(page.textContent).toContain('조건에 맞는 실거래가 없어요');
    expect(page.textContent).not.toContain('재시도 전세 단지');

    await act(async () => {
      findButton(page, '필터 초기화')!.click();
      await settle();
    });

    expect(routerReplace).toHaveBeenLastCalledWith(
      '/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=6&dealType=jeonse',
      { scroll: false },
    );
    expect(page.textContent).toContain('재시도 전세 단지');
  });

  it('선택 단지의 분양권이 없으면 광고를 숨기고 초기화 후 실제 목록과 함께 노출한다', async () => {
    const otherPresale = {
      id: 'other-presale', masterId: 'A-OTHER', name: '다른 분양권 단지',
      district: '강남구', dong: '삼성동', buildYear: 2026,
      areas: [84], transactions: [],
    };
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/silv?')) return response(true, { data: [otherPresale] });
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const page = await renderClient(
      'district=강남구&q=없는단지&aptId=A-NONE&aptDong=대치동&months=2&dealType=bunyang',
    );
    expect(page.textContent).toContain('조건에 맞는 실거래가 없어요');
    expect(page.querySelector('[data-testid="coupang-banner"]')).toBeNull();

    await act(async () => {
      findButton(page, '필터 초기화')!.click();
      await settle();
    });

    expect(routerReplace).toHaveBeenLastCalledWith(
      '/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=6&dealType=bunyang',
      { scroll: false },
    );
    expect(page.textContent).toContain('다른 분양권 단지');
    expect(page.querySelector('[data-sub-id="tx-bunyang-feed"]')).not.toBeNull();
  });
});
