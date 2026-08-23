// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/dynamic', () => ({
  default: () => function DynamicComponentStub() { return null; },
}));

vi.mock('@/components/layout/Header', () => ({ default: () => null }));
vi.mock('@/components/chart/PriceChart', () => ({ default: () => null }));
vi.mock('@/components/common/ErrorState', () => ({
  default: ({ message, onRetry }: { message: string; onRetry: () => void }) => (
    <div role="alert">
      {message}
      <button type="button" onClick={onRetry}>다시 시도</button>
    </div>
  ),
}));

interface SelectorProps {
  onDistrictChange: (district: string) => void;
  onAptSearch: (aptName: string) => void;
}

vi.mock('@/components/chart/ApartmentSelector', () => ({
  default: ({ onDistrictChange, onAptSearch }: SelectorProps) => (
    <aside>
      <button type="button" data-action="district" onClick={() => onDistrictChange('서초구')}>
        지역 조회
      </button>
      <button type="button" data-action="name" onClick={() => onAptSearch('동명 아파트')}>
        단지명 조회
      </button>
    </aside>
  ),
}));

interface AutocompleteProps {
  onSelect: (apt: {
    id: string;
    name: string;
    sido: string;
    sigungu: string;
    dong: string;
    lawdCd: string;
  }) => void;
}

vi.mock('@/components/search/AptAutocomplete', () => ({
  AptAutocomplete: ({ onSelect }: AutocompleteProps) => (
    <button
      type="button"
      data-action="exact"
      onClick={() => onSelect({
        id: 'master-exact-123',
        name: '동명 아파트',
        sido: '서울특별시',
        sigungu: '송파구',
        dong: '잠실동',
        lawdCd: '11710',
      })}
    >
      정확한 단지 선택
    </button>
  ),
}));

import ChartPage from '../page';

interface PendingFetch {
  url: string;
  init: RequestInit | undefined;
  resolve: (response: Response) => void;
}

const pending: PendingFetch[] = [];
const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((resolve) => {
    pending.push({ url: String(input), init, resolve });
  }),
);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function transactionResponse(id: string, name: string, district: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      district,
      data: [{
        id,
        name,
        district,
        areas: [84],
        transactions: [{
          area: 84,
          floor: 10,
          price: 200000,
          pricePerArea: 2381,
          date: '2026-08-01',
        }],
      }],
    }),
  } as Response;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderChart(): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ChartPage />);
    await flush();
  });
  return host;
}

function click(action: string) {
  const button = host?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!button) throw new Error(`${action} button not found`);
  button.click();
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  pending.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('ChartContent transaction request coordination', () => {
  it('정확한 aptId를 기간 변경 후에도 유지하고 늦은 지역·단지명 응답을 무시한다', async () => {
    const chart = await renderChart();
    expect(pending[0].url).toContain('district=%EA%B0%95%EB%82%A8%EA%B5%AC');
    expect(pending[0].init?.signal).toBeInstanceOf(AbortSignal);

    await act(async () => {
      click('name');
      await flush();
    });
    expect(pending[1].url).toContain('aptName=%EB%8F%99%EB%AA%85+%EC%95%84%ED%8C%8C%ED%8A%B8');
    expect((pending[0].init?.signal as AbortSignal).aborted).toBe(true);

    await act(async () => {
      click('exact');
      await flush();
    });
    expect(pending[2].url).toContain('aptId=master-exact-123');
    expect(pending[2].url).not.toContain('aptName=');
    expect((pending[1].init?.signal as AbortSignal).aborted).toBe(true);

    await act(async () => {
      pending[2].resolve(transactionResponse('exact-result', '정확한 선택 결과', '송파구'));
      await flush();
    });
    expect(chart.textContent).toContain('정확한 선택 결과');

    // fetch mock이 abort를 무시해도 요청 ID 검증이 오래된 응답의 state 반영을 막아야 한다.
    await act(async () => {
      pending[1].resolve(transactionResponse('name-result', '늦은 단지명 결과', '서초구'));
      pending[0].resolve(transactionResponse('district-result', '늦은 지역 결과', '강남구'));
      await flush();
    });
    expect(chart.textContent).toContain('정확한 선택 결과');
    expect(chart.textContent).not.toContain('늦은 단지명 결과');
    expect(chart.textContent).not.toContain('늦은 지역 결과');

    const threeMonths = [...chart.querySelectorAll('button')]
      .find((button) => button.textContent === '3개월');
    expect(threeMonths).toBeDefined();
    await act(async () => {
      threeMonths!.click();
      await flush();
    });
    expect(pending[3].url).toContain('months=3');
    expect(pending[3].url).toContain('aptId=master-exact-123');
    expect(pending[3].url).not.toContain('district=');
    expect(pending[3].url).not.toContain('aptName=');
  });
});
