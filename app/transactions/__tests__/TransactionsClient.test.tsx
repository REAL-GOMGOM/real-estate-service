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
  default: ({ apt, dataComplete, onClick }: { apt: { name: string }; dataComplete?: boolean; onClick: () => void }) =>
    <button data-testid="apt-card" data-complete={dataComplete} onClick={onClick}>{apt.name}</button>,
}));
vi.mock('../components/RentAptCard', () => ({
  default: ({ apt, dataComplete, onClick }: { apt: { name: string }; dataComplete?: boolean; onClick: () => void }) =>
    <button data-testid="rent-card" data-complete={dataComplete} onClick={onClick}>{apt.name}</button>,
}));
vi.mock('../components/AptDetailModal', () => ({
  default: ({ apt, dealType, initialTx, dataComplete }: { apt: { name: string; transactions: { date: string }[] }; dealType: string; initialTx: string; dataComplete?: boolean }) =>
    <div data-testid="buy-modal" data-complete={dataComplete} data-deal-type={dealType} data-tx={initialTx} data-contract-dates={apt.transactions.map((transaction) => transaction.date).join(',')}>{apt.name}</div>,
}));
vi.mock('../components/RentAptDetailModal', () => ({
  default: ({ apt, initialTx, dataComplete }: { apt: { name: string; transactions: { date: string }[] }; initialTx: string; dataComplete?: boolean }) =>
    <div data-testid="rent-modal" data-complete={dataComplete} data-tx={initialTx} data-contract-dates={apt.transactions.map((transaction) => transaction.date).join(',')}>{apt.name}</div>,
}));
vi.mock('../components/RegionPickerModal', () => ({
  default: ({ initialLabel, onPick }: { initialLabel: string; onPick: (district: string) => void }) => (
    <div role="dialog" aria-label="지역 선택">
      <span>{initialLabel}</span>
      <button type="button" onClick={() => onPick('강남구')}>강남구 선택</button>
    </div>
  ),
}));
vi.mock('../components/DistrictChips', () => ({
  default: ({ districts, active, onPick }: { districts: string[]; active: string; onPick: (district: string) => void }) => (
    <div data-testid="district-chips" data-districts={districts.join(',')} data-active={active}>
      <button type="button" onClick={() => onPick('서초구')}>서초구 칩</button>
    </div>
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

function response(ok: boolean, body: unknown, generatedAt?: string) {
  return Promise.resolve({ ok, json: async () => body, headers: new Headers(generatedAt ? {
    'X-Naezip-Data-Source': 'snapshot',
    'X-Naezip-Snapshot-Generated-At': generatedAt,
  } : undefined) });
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

describe('TransactionsClient data freshness', () => {
  const oldSnapshot = '2026-08-15T20:17:00Z';
  const nextSnapshot = '2026-08-16T20:20:00Z';
  const label = (page: HTMLElement) => page.querySelector('[aria-label="데이터 갱신 정보"]')!;

  it.each(['buy', 'jeonse', 'monthly', 'bunyang'])(
    '%s displays the successful response timestamp, even for an empty result', async (dealType) => {
      fetchMock.mockImplementation((input) => String(input).startsWith('/api/transactions/districts')
        ? response(true, { districts: [] }) : response(true, { data: [] }, oldSnapshot));
      const page = await renderClient(`district=강남구&dealType=${dealType}`);
      expect(label(page).textContent).toBe('데이터 기준 2026.08.16 05:17 (한국시간)');
      expect(label(page).querySelector('time')?.dateTime).toBe('2026-08-15T20:17:00.000Z');
      expect(page.textContent).not.toContain('최신 실거래');
    },
  );

  it('never substitutes the current day for missing metadata or an error', async () => {
    fetchMock.mockImplementation((input) => String(input).startsWith('/api/transactions/districts')
      ? response(true, { districts: [] }) : response(true, { data: [] }));
    const page = await renderClient('district=강남구');
    expect(label(page).textContent).toBe('데이터 기준 시각 확인 불가');
    fetchMock.mockImplementation((input) => String(input).startsWith('/api/transactions/districts')
      ? response(true, { districts: [] }) : response(false, { error: 'unavailable' }, oldSnapshot));
    routeQuery.value = 'district=서초구';
    await act(async () => { root!.render(<TransactionsClient />); await settle(); });
    expect(label(page).textContent).toBe('데이터 기준 시각 확인 불가');
    expect(label(page).querySelector('time')).toBeNull();
  });

  it('hides previous apartment metadata while a new URL request is pending or fails', async () => {
    let finish: ((value: Awaited<ReturnType<typeof response>>) => void) | undefined;
    fetchMock.mockImplementation((input) => {
      if (String(input).includes('aptId=NEW')) return new Promise((resolve) => { finish = resolve; });
      return String(input).startsWith('/api/transactions/districts')
        ? response(true, { districts: [] }) : response(true, { data: [] }, oldSnapshot);
    });
    const page = await renderClient('district=강남구&q=이전단지&aptId=OLD');
    expect(label(page).textContent).toContain('2026.08.16');
    routeQuery.value = 'district=강남구&q=새단지&aptId=NEW';
    await act(async () => { root!.render(<TransactionsClient />); await settle(); });
    expect(label(page).textContent).toBe('데이터 기준 시각 확인 중');
    expect(label(page).querySelector('time')).toBeNull();
    await act(async () => { finish!(await response(false, { error: 'not found' }, nextSnapshot)); await settle(); });
    expect(label(page).textContent).toBe('데이터 기준 시각 확인 불가');
  });

  it('switches rent market/period metadata and preserves the matching cached metadata', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/districts')) return response(true, { districts: [] });
      return response(true, { data: [] }, url.includes('months=6') ? nextSnapshot : oldSnapshot);
    });
    const page = await renderClient('district=강남구&dealType=jeonse');
    expect(label(page).textContent).toContain('2026.08.16 05:17');
    routeQuery.value = 'district=강남구&dealType=monthly&months=6';
    await act(async () => { root!.render(<TransactionsClient />); await settle(); });
    expect(label(page).textContent).toContain('2026.08.17 05:20');
    routeQuery.value = 'district=강남구&dealType=buy&months=6';
    await act(async () => { root!.render(<TransactionsClient />); await settle(); });
    const rentRequests = () => fetchMock.mock.calls.filter(([input]) => String(input).startsWith('/api/transactions/rent')).length;
    const count = rentRequests();
    routeQuery.value = 'district=강남구&dealType=monthly&months=6';
    await act(async () => { root!.render(<TransactionsClient />); await settle(); });
    expect(rentRequests()).toBe(count);
    expect(label(page).textContent).toContain('2026.08.17 05:20');
  });

  it('summary uses snapshot metadata and does not call an older daily batch today', async () => {
    fetchMock.mockImplementation(() => response(true, {
      summary: [{ label: '서울', estimatedCount: 1, newHighs: 0, avg59: null, avg84: null, firstDistrict: '강남구' }],
      daily: { date: '2026-08-15', totalCount: 1, totalNewHighs: 0 },
      updatedAt: nextSnapshot,
    }, oldSnapshot));
    const page = await renderClient('');
    expect(label(page).textContent).toBe('데이터 기준 2026.08.16 05:17 (한국시간)');
    expect(page.textContent).toContain('2026-08-15 공개분');
    expect(page.textContent).not.toContain('오늘 공개');
  });

  it.each([
    ['buy', false], ['buy', true], ['jeonse', false], ['jeonse', true], ['bunyang', false], ['bunyang', true],
  ] as const)('%s restores records and freshness together after another request (failed=%s)', async (dealType, failed) => {
    let finish: ((value: Awaited<ReturnType<typeof response>>) => void) | undefined;
    const firstGroup = dealType === 'jeonse' ? rentGroup : {
      id: 'cached-apt', name: '보존할 매매 단지', district: '강남구', dong: '대치동', areas: [84],
      transactions: [{ date: '2026-08-15', area: 84, floor: 10, price: 90000 }],
    };
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/districts')) return response(true, { districts: [] });
      if (url.includes('months=6')) return new Promise((resolve) => { finish = resolve; });
      return response(true, { data: [firstGroup] }, oldSnapshot);
    });
    const firstQuery = `district=강남구&dealType=${dealType}&months=2`;
    const page = await renderClient(firstQuery);
    routeQuery.value = `district=강남구&dealType=${dealType === 'jeonse' ? 'monthly' : dealType}&months=6`;
    await act(async () => { root!.render(<TransactionsClient />); await settle(); });
    expect(label(page).textContent).toBe('데이터 기준 시각 확인 중');
    if (failed) {
      await act(async () => { finish!(await response(false, { error: 'unavailable' })); await settle(); });
      expect(label(page).textContent).toBe('데이터 기준 시각 확인 불가');
    }
    routeQuery.value = firstQuery;
    await act(async () => { root!.render(<TransactionsClient />); await settle(); });
    expect(label(page).textContent).toContain('2026.08.16 05:17');
    expect(page.querySelector('[data-testid="apt-card"], [data-testid="rent-card"]')?.textContent).toBe(firstGroup.name);
    expect(page.querySelector('[role="alert"]')).toBeNull();
    if (!failed) {
      await act(async () => { finish!(await response(true, { data: [] }, nextSnapshot)); await settle(); });
      expect(label(page).textContent).toContain('2026.08.16 05:17');
      expect(page.querySelector('[data-testid="apt-card"], [data-testid="rent-card"]')?.textContent).toBe(firstGroup.name);
    }
  });

  it('ignores a superseded summary response even when fetch does not honor cancellation', async () => {
    let finish: ((value: Awaited<ReturnType<typeof response>>) => void) | undefined;
    const summary = [{ label: '서울', estimatedCount: 1, newHighs: 0, avg59: null, avg84: null, firstDistrict: '강남구' }];
    fetchMock.mockImplementation((input) => String(input).includes('dealType=jeonse')
      ? response(true, { summary }, nextSnapshot)
      : new Promise((resolve) => { finish = resolve; }));
    const page = await renderClient('');
    routeQuery.value = 'dealType=jeonse';
    await act(async () => { root!.render(<TransactionsClient />); await settle(); });
    expect(label(page).textContent).toContain('2026.08.17 05:20');
    await act(async () => { finish!(await response(true, { summary }, oldSnapshot)); await settle(); });
    expect(label(page).textContent).toContain('2026.08.17 05:20');
  });
});

describe('TransactionsClient full district navigation', () => {
  it('restores a home Hongcheon link in Gangwon, including its stats, chips and picker', async () => {
    fetchMock.mockImplementation((input) => String(input).startsWith('/api/transactions/districts')
      ? response(true, { districts: [{ district: '춘천시', count: 5, newHighs: 0 }] })
      : response(true, { data: [] }));
    const page = await renderClient(`district=${encodeURIComponent('홍천군')}`);

    expect(page.querySelector('h1')?.textContent).toContain('홍천군');
    const requests = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requests).toContain(`/api/transactions/districts?group=${encodeURIComponent('강원')}`);
    expect(requests).not.toContain(`/api/transactions/districts?group=${encodeURIComponent('서울')}`);
    expect(requests.some((url) => url.startsWith('/api/transactions?') && url.includes(encodeURIComponent('홍천군')))).toBe(true);
    const chips = page.querySelector('[data-testid="district-chips"]');
    expect(chips?.getAttribute('data-active')).toBe('홍천군');
    expect(chips?.getAttribute('data-districts')?.split(',')).toContain('홍천군');
    expect(chips?.getAttribute('data-districts')?.split(',')).not.toContain('강남구');

    await act(async () => { page.querySelector<HTMLButtonElement>('button[aria-label="지역 변경"]')!.click(); });
    expect(page.querySelector('[role="dialog"][aria-label="지역 선택"]')?.textContent).toContain('강원');
  });
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

describe('TransactionsClient incomplete history', () => {
  const types = ['buy', 'jeonse', 'monthly', 'bunyang'] as const;
  const endpointFor = (type: typeof types[number]) => type === 'buy' ? '/api/transactions?'
    : type === 'bunyang' ? '/api/transactions/silv?' : '/api/transactions/rent?';
  const groupFor = (type: typeof types[number]) => type === 'jeonse' || type === 'monthly' ? rentGroup : {
    ...rentGroup, transactions: [{ ...rentGroup.transactions[0], price: 80_000 }],
  };

  it.each(types)('%s forwards coverage to cards/modals and retries past a cached partial response', async (type) => {
    let attempts = 0;
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(endpointFor(type))) {
        attempts++;
        return response(true, { data: [groupFor(type)], status: attempts === 1 ? 'partial' : 'ok',
          failedMonths: attempts === 1 ? ['202607', '202608'] : [] });
      }
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const page = await renderClient(`district=강남구&months=6&dealType=${type}`);
    const isRent = type === 'jeonse' || type === 'monthly';
    const cardSelector = `[data-testid="${isRent ? 'rent-card' : 'apt-card'}"]`;
    const modalSelector = `[data-testid="${isRent ? 'rent-modal' : 'buy-modal'}"]`;
    expect(page.textContent).toContain('누락된 월: 2026.08, 2026.07');
    expect(page.querySelector(cardSelector)?.getAttribute('data-complete')).toBe('false');
    if (type === 'buy') expect(findButton(page, '신고가')?.disabled).toBe(true);
    await act(async () => { (page.querySelector(cardSelector) as HTMLButtonElement).click(); await settle(); });
    expect(page.querySelector(modalSelector)?.getAttribute('data-complete')).toBe('false');
    await act(async () => { findButton(page, '누락 자료 다시 조회')!.click(); await settle(); });
    expect(attempts).toBe(2);
    expect(page.querySelector(modalSelector)).toBeNull();
    expect(page.textContent).not.toContain('누락된 월:');
    expect(page.querySelector(cardSelector)?.getAttribute('data-complete')).toBe('true');
  });

  it.each(types)('%s does not claim no trades when incomplete results are empty', async (type) => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(endpointFor(type))) return response(true, { data: [], status: 'partial', failedMonths: ['202608'] });
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const page = await renderClient(`district=강남구&months=6&dealType=${type}`);
    expect(page.textContent).toContain('거래가 없었다는 뜻은 아닙니다');
    expect(page.textContent).not.toContain('거래가 없어요');
    expect(page.textContent).not.toContain('조건에 맞는 거래');
    expect(findButton(page, '누락 자료 다시 조회')).toBeDefined();
  });

  it.each(types)('%s restores cached records together with their missing months after a failed query', async (type) => {
    let attempts = 0;
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(endpointFor(type))) {
        attempts++;
        return new URL(url, 'http://localhost').searchParams.get('months') === '6'
          ? response(true, { data: [groupFor(type)], status: 'partial', failedMonths: ['202607'] })
          : response(false, { error: 'unavailable' });
      }
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const page = await renderClient(`district=강남구&months=6&dealType=${type}`);
    await act(async () => { findButton(page, '1년')!.click(); await settle(); });
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => { findButton(page, '6개월')!.click(); await settle(); });
    expect(attempts).toBe(2);
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(page.textContent).toContain('누락된 월: 2026.07');
    expect(page.querySelector('[data-complete="false"]')).not.toBeNull();
  });

  it('aborts a pending long buy query on tab change and ignores its late response', async () => {
    let buySignal: AbortSignal | undefined;
    let resolveBuy: ((value: Awaited<ReturnType<typeof response>>) => void) | undefined;
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/transactions?')) {
        buySignal = init?.signal ?? undefined;
        return new Promise((resolve) => { resolveBuy = resolve; });
      }
      if (url.startsWith('/api/transactions/rent?')) return response(true, { data: [rentGroup] });
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const page = await renderClient('district=강남구&months=36');
    expect(page.textContent).toContain('과거 월별 자료를 확인하고 있어요');
    expect(buySignal?.aborted).toBe(false);
    await act(async () => { findButton(page, '전세')!.click(); await settle(); });
    expect(buySignal?.aborted).toBe(true);
    await act(async () => { resolveBuy!(await response(true, { data: [groupFor('buy')], status: 'partial' })); await settle(); });
    expect(page.querySelector('[data-testid="rent-card"]')?.getAttribute('data-complete')).toBe('true');
    expect(page.textContent).not.toContain('부분 집계');
  });
});

describe('TransactionsClient apartment search', () => {
  it('매매 응답 뒤 지연된 URL이 반영되어도 같은 조건의 계약 딥링크를 연다', async () => {
    const historicalTx = '2025-10-01_84_10_80000';
    const makeGroup = (date: string) => ({
      ...rentGroup, masterId: 'A-GARAM', name: '가람', dong: '일원동',
      transactions: [{ ...rentGroup.transactions[0], price: 80_000, date }],
    });
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions?')) {
        const months = new URL(url, 'http://localhost').searchParams.get('months');
        return response(true, {
          data: [makeGroup(months === '12' ? '2025-10-01' : '2026-09-05')],
        }, '2026-09-05T20:00:00Z');
      }
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const originalQuery = 'district=강남구&q=가람&aptId=A-GARAM&aptDong=일원동&months=2';
    const page = await renderClient(originalQuery);
    const buyRequests = () => fetchMock.mock.calls.filter(([input]) => String(input).startsWith('/api/transactions?')).length;
    let pendingHref = '';
    // The optimistic period and successful records arrive before useSearchParams changes.
    routerReplace.mockImplementation((href: string) => { pendingHref = href; });
    await act(async () => {
      findButton(page, '1년')!.click();
      await settle();
    });
    expect(routeQuery.value).toBe(originalQuery);
    expect(findButton(page, '1년')?.getAttribute('aria-pressed')).toBe('true');
    expect(new URL(pendingHref, 'http://localhost').searchParams.get('months')).toBe('12');
    expect(buyRequests()).toBe(2);
    expect(page.querySelector('[data-testid="apt-card"]')?.textContent).toBe('가람');

    await act(async () => {
      routeQuery.value = pendingHref.slice(pendingHref.indexOf('?') + 1);
      root!.render(<TransactionsClient />);
      await settle();
    });
    expect(buyRequests()).toBe(2);
    expect(page.querySelector('[data-testid="buy-modal"]')).toBeNull();

    // Only tx changes: the already-successful request must remain eligible to open.
    await act(async () => {
      const params = new URLSearchParams(routeQuery.value);
      params.set('tx', historicalTx);
      routeQuery.value = params.toString();
      root!.render(<TransactionsClient />);
      await settle();
    });
    const modal = page.querySelector('[data-testid="buy-modal"]');
    expect(modal?.getAttribute('data-contract-dates')).toBe('2025-10-01');
    expect(modal?.getAttribute('data-tx')).toBe(historicalTx);
    expect(buyRequests()).toBe(2);
  });

  it.each(['buy', 'jeonse', 'monthly', 'bunyang'])(
    '%s 새 기간의 공유 링크는 기존 모달을 닫고 해당 요청의 과거 계약 응답을 기다린다',
    async (dealType) => {
      const isRent = dealType === 'jeonse' || dealType === 'monthly';
      const endpoint = dealType === 'buy' ? '/api/transactions?'
        : dealType === 'bunyang' ? '/api/transactions/silv?' : '/api/transactions/rent?';
      const makeGroup = (date: string) => ({
        ...rentGroup, masterId: 'A-GARAM', name: '가람', dong: '일원동',
        transactions: [{ ...rentGroup.transactions[0], price: 80_000, date }],
      });
      let finishHistorical!: (body: unknown) => void;
      const historicalResponse = new Promise((resolve) => {
        finishHistorical = (body) => resolve({ ok: true, json: async () => body });
      });
      fetchMock.mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.startsWith(endpoint)) {
          const months = new URL(url, 'http://localhost').searchParams.get('months');
          return months === '12' ? historicalResponse : response(true, { data: [makeGroup('2026-09-05')] });
        }
        if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
        throw new Error(`Unexpected fetch: ${url}`);
      });
      const queryFor = (months: number, date: string) =>
        `district=강남구&q=가람&aptId=A-GARAM&aptDong=일원동&months=${months}&dealType=${dealType}&${isRent ? 'rtx' : 'tx'}=${date}_84_10_80000${isRent ? '_0' : ''}`;
      const page = await renderClient(queryFor(2, '2026-09-05'));
      const modalSelector = `[data-testid="${isRent ? 'rent' : 'buy'}-modal"]`;
      expect(page.querySelector(modalSelector)?.getAttribute('data-contract-dates')).toBe('2026-09-05');

      await act(async () => {
        routeQuery.value = queryFor(12, '2025-10-01');
        root!.render(<TransactionsClient />);
        await settle();
      });
      expect(page.querySelector(modalSelector)).toBeNull();

      await act(async () => {
        finishHistorical({ data: [makeGroup('2025-10-01')] });
        await settle();
      });
      const modal = page.querySelector(modalSelector);
      expect(modal?.getAttribute('data-contract-dates')).toBe('2025-10-01');
      expect(modal?.getAttribute('data-tx')).toContain('2025-10-01');
    },
  );

  it.each(['buy', 'jeonse', 'monthly', 'bunyang'])(
    '%s 같은 단지 ID의 별칭 그룹이 여러 개면 공유한 계약이 있는 그룹을 연다',
    async (dealType) => {
      const isRent = dealType === 'jeonse' || dealType === 'monthly';
      const endpoint = dealType === 'buy' ? '/api/transactions?'
        : dealType === 'bunyang' ? '/api/transactions/silv?' : '/api/transactions/rent?';
      fetchMock.mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.startsWith(endpoint)) return response(true, { data: [
          { ...rentGroup, masterId: 'A-GARAM', name: '가람', transactions: [{ ...rentGroup.transactions[0], price: 80_000, date: '2026-09-05' }] },
          { ...rentGroup, masterId: 'A-GARAM', name: '가람아파트', transactions: [{ ...rentGroup.transactions[0], price: 80_000, date: '2026-08-01' }] },
        ] });
        if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
        throw new Error(`Unexpected fetch: ${url}`);
      });
      const page = await renderClient(
        `district=강남구&q=가람&aptId=A-GARAM&months=2&dealType=${dealType}&${isRent ? 'rtx' : 'tx'}=2026-08-01_84_10_80000${isRent ? '_0' : ''}`,
      );
      expect(page.querySelector(`[data-testid="${isRent ? 'rent' : 'buy'}-modal"]`)?.textContent).toBe('가람아파트');
    },
  );

  it.each(['buy', 'jeonse', 'monthly', 'bunyang'])(
    '%s 공유는 이름 표기가 달라도 단지 ID로 올바른 유형의 계약 모달을 연다',
    async (dealType) => {
      const isRent = dealType === 'jeonse' || dealType === 'monthly';
      const endpoint = dealType === 'buy' ? '/api/transactions?'
        : dealType === 'bunyang' ? '/api/transactions/silv?' : '/api/transactions/rent?';
      fetchMock.mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.startsWith(endpoint)) return response(true, { data: [{
          ...rentGroup, masterId: 'A-GARAM', name: '가람아파트', dong: '일원동',
        }] });
        if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
        throw new Error(`Unexpected fetch: ${url}`);
      });
      const page = await renderClient(
        `district=강남구&q=등록명&aptId=A-GARAM&aptDong=일원동&dealType=${dealType}&${isRent ? 'rtx' : 'tx'}=contract-key`,
      );
      const modal = page.querySelector(`[data-testid="${isRent ? 'rent' : 'buy'}-modal"]`);
      expect(modal?.textContent).toBe('가람아파트');
      expect(modal?.getAttribute('data-tx')).toBe('contract-key');
      if (!isRent) expect(modal?.getAttribute('data-deal-type')).toBe(dealType);
    },
  );

  it.each(['jeonse', 'monthly', 'bunyang'])(
    '%s 탭도 선택 단지를 서버에 전달하고 같은 지역의 다른 단지 선택 시 다시 조회한다',
    async (dealType) => {
      const endpoint = dealType === 'bunyang' ? '/api/transactions/silv?' : '/api/transactions/rent?';
      const requestedIds: (string | null)[] = [];
      fetchMock.mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.startsWith(endpoint)) {
          const params = new URL(url, 'http://localhost').searchParams;
          const id = params.get('aptId');
          requestedIds.push(id);
          if (!id) return response(true, { data: [] });
          return response(true, {
            data: [{
              ...rentGroup, id, masterId: id,
              name: id === 'A-GARAM' ? '가람아파트' : '다음 단지',
              dong: '일원동',
            }],
          });
        }
        if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
        throw new Error(`Unexpected fetch: ${url}`);
      });
      const page = await renderClient(
        `district=강남구&q=가람&aptId=A-GARAM&aptDong=일원동&months=2&dealType=${dealType}`,
      );
      expect(requestedIds).toEqual(['A-GARAM']);
      expect(page.textContent).toContain('가람아파트');
      expect(page.textContent).not.toContain('조건에 맞는 실거래가 없어요');

      await act(async () => {
        routeQuery.value = `district=강남구&q=다음단지&aptId=A-NEXT&aptDong=일원동&months=2&dealType=${dealType}`;
        root!.render(<TransactionsClient />);
        await settle();
      });
      expect(requestedIds).toEqual(['A-GARAM', 'A-NEXT']);
      expect(page.textContent).toContain('다음 단지');
      expect(page.textContent).not.toContain('가람아파트');
    },
  );

  it.each(['buy', 'jeonse', 'monthly', 'bunyang'])(
    '%s 기존 공유 링크도 이름과 법정동을 서버에서 먼저 검색한다',
    async (dealType) => {
      const endpoint = dealType === 'buy' ? '/api/transactions?'
        : dealType === 'bunyang' ? '/api/transactions/silv?' : '/api/transactions/rent?';
      fetchMock.mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.startsWith(endpoint)) return response(true, { data: [] });
        if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
        throw new Error(`Unexpected fetch: ${url}`);
      });
      await renderClient(`district=강남구&q=가람&aptDong=일원동&months=2&dealType=${dealType}`);
      const call = fetchMock.mock.calls.find(([url]) => String(url).startsWith(endpoint));
      expect(call).toBeDefined();
      const params = new URL(String(call![0]), 'http://localhost').searchParams;
      expect(params.get('aptName')).toBe('가람');
      expect(params.get('aptDong')).toBe('일원동');
      expect(params.has('aptId')).toBe(false);
    },
  );

  it('선택 단지 확인 실패는 전세 0건이 아닌 조회 오류로 표시한다', async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/transactions/rent?')) return response(false, { error: '단지 기준 데이터 확인 실패' });
      if (url.startsWith('/api/transactions/districts?')) return response(true, { districts: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const page = await renderClient('district=강남구&q=가람&aptId=A-GARAM&aptDong=일원동&dealType=jeonse');
    expect(page.querySelector('[role="alert"]')).not.toBeNull();
    expect(page.textContent).not.toContain('조건에 맞는 실거래가 없어요');
  });

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
