// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeQuery = vi.hoisted(() => ({ value: '' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(routeQuery.value),
}));
vi.mock('@/components/layout/Header', () => ({ default: () => null }));
vi.mock('@/components/search/AptAutocomplete', () => ({ AptAutocomplete: () => null }));
vi.mock('@/components/shared/AnalysisPromoBar', () => ({ AnalysisPromoBar: () => null }));
vi.mock('@/components/ads/CoupangBanner', () => ({ default: () => null }));
vi.mock('../components/AptCard', () => ({
  default: ({ apt }: { apt: { name: string } }) => <div data-testid="apt-card">{apt.name}</div>,
}));
vi.mock('../components/RentAptCard', () => ({
  default: ({ apt }: { apt: { name: string } }) => <div data-testid="rent-card">{apt.name}</div>,
}));
vi.mock('../components/AptDetailModal', () => ({ default: () => null }));
vi.mock('../components/RentAptDetailModal', () => ({ default: () => null }));
vi.mock('../components/RegionPickerModal', () => ({ default: () => null }));
vi.mock('../components/DistrictChips', () => ({ default: () => null }));
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
