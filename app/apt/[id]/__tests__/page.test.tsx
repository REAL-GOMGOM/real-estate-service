import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getAptPageData: vi.fn(),
  AptPageDataUnavailableError: class AptPageDataUnavailableError extends Error {},
}));

vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/apt-detail', () => ({
  AptPageDataUnavailableError: mocks.AptPageDataUnavailableError,
  getAptPageData: mocks.getAptPageData,
}));
vi.mock('@/components/layout/Header', () => ({ default: () => null }));
vi.mock('@/components/layout/Footer', () => ({ default: () => null }));
vi.mock('@/components/apt/PriceComboChart', () => ({ default: () => null }));
vi.mock('@/components/apt/ApartmentRetentionActions', () => ({ default: () => null }));
vi.mock('@/components/ads/CoupangBanner', () => ({ default: () => null }));
vi.mock('@/components/shared/AnalysisPromoBar', () => ({ AnalysisPromoBar: () => null }));
vi.mock('../AptShareActions', () => ({ default: () => null }));
vi.mock('../AptTxTable', () => ({ default: () => null }));
vi.mock('../AptDealTabs', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));

import AptPage, { generateMetadata } from '../page';

const master = {
  id: 'apt-a', name: '현대', aliases: [], sido: '서울특별시', sigungu: '강남구',
  dong: '압구정동', roadAddress: null, jibunAddress: null, lawdCd: '11680',
  kaptCode: null, totalHouseholds: 1000, totalDongs: 10, lat: null, lng: null,
  source: 'test', updatedAt: new Date('2026-08-09T00:00:00Z'),
};

function pageData(
  transactionsStatus: 'ok' | 'error',
  rentStatus: 'ok' | 'error',
  {
    sales = 0,
    rents = 0,
    salesMonths = 12,
    rentMonths = 6,
    allTimeHighStatus = 'ok',
    salePrices,
  }: {
    sales?: number;
    rents?: number;
    salesMonths?: number;
    rentMonths?: number;
    allTimeHighStatus?: 'ok' | 'ambiguous' | 'error' | 'unavailable';
    salePrices?: number[];
  } = {},
) {
  const prices = salePrices ?? Array.from({ length: sales }, (_, index) => 110_000 - index * 10_000);
  return {
    master,
    district: '강남구',
    group: {
      id: master.id, name: master.name, district: '강남구', dong: master.dong,
      buildYear: null, households: master.totalHouseholds, areas: [],
      transactions: prices.map((price, index) => ({
        aptName: master.name,
        district: '강남구',
        dong: master.dong,
        area: 84,
        floor: 10,
        price,
        pricePerArea: Math.round(price / 84),
        date: index === 0 ? '2026-08-15' : `2026-07-${String(15 - index).padStart(2, '0')}`,
        buildYear: 2000,
      })),
    },
    allTimeHigh: null,
    recentJeonse: [],
    rentTransactions: Array.from({ length: rents }, () => ({ deposit: 50_000 })),
    aptScore: null,
    transactionsStatus,
    rentStatus,
    allTimeHighStatus,
    salesMonths,
    rentMonths,
  };
}

async function collectResolvedText(node: ReactNode, text: string[] = []): Promise<string[]> {
  if (node == null || typeof node === 'boolean') return text;
  if (typeof node === 'string' || typeof node === 'number') {
    text.push(String(node));
    return text;
  }
  if (Array.isArray(node)) {
    for (const child of node) await collectResolvedText(child, text);
    return text;
  }
  if (!isValidElement(node)) return text;
  if (typeof node.type === 'function') {
    const render = node.type as (props: never) => ReactNode | Promise<ReactNode>;
    const rendered = await render(node.props as never);
    return collectResolvedText(rendered, text);
  }
  return collectResolvedText((node.props as { children?: ReactNode }).children, text);
}

async function renderAptContent() {
  const page = AptPage({ params: Promise.resolve({ id: master.id }) });
  const children = Children.toArray((page.props as { children: ReactNode }).children);
  const main = children.find((child) =>
    isValidElement(child) && child.type === 'main',
  );
  if (!isValidElement(main)) throw new Error('main not found');
  const content = (main.props as { children: ReactNode }).children;
  if (!isValidElement(content) || typeof content.type !== 'function') {
    throw new Error('AptContent not found');
  }
  const render = content.type as (props: never) => ReactNode | Promise<ReactNode>;
  return render(content.props as never);
}

beforeEach(() => {
  mocks.connection.mockReset();
  mocks.connection.mockResolvedValue(undefined);
  mocks.getAptPageData.mockReset();
});

describe('단지 페이지 원장 상태', () => {
  it('DB 오류를 거래 0건 문구로 위장하지 않는다', async () => {
    mocks.getAptPageData.mockResolvedValue(pageData('error', 'error'));

    const content = await renderAptContent();
    const text = (await collectResolvedText(content)).join('').replace(/\s+/g, '');

    expect(text).toContain('매매거래데이터를불러오지못했습니다');
    expect(text).toContain('전월세거래데이터를불러오지못했습니다');
    expect(text).not.toContain('매매거래가없습니다');
    expect(text).not.toContain('전월세거래가없습니다');
  });

  it('정상 조회의 빈 결과만 최근 거래 0건으로 표시한다', async () => {
    mocks.getAptPageData.mockResolvedValue(pageData('ok', 'ok'));

    const content = await renderAptContent();
    const text = (await collectResolvedText(content)).join('').replace(/\s+/g, '');

    expect(text).toContain('최근12개월내신고된매매거래가없습니다');
    expect(text).toContain('최근6개월내전월세거래가없습니다');
    expect(text).not.toContain('데이터를불러오지못했습니다');
  });

  it('스냅샷 조회 기간을 그대로 표시하고 12개월·6개월로 과장하지 않는다', async () => {
    mocks.getAptPageData.mockResolvedValue(pageData('ok', 'ok', {
      salesMonths: 2,
      rentMonths: 2,
      allTimeHighStatus: 'unavailable',
    }));

    const content = await renderAptContent();
    const text = (await collectResolvedText(content)).join('').replace(/\s+/g, '');

    expect(text).toContain('최근2개월내신고된매매거래가없습니다');
    expect(text).toContain('최근2개월내전월세거래가없습니다');
    expect(text).not.toContain('최근12개월');
    expect(text).not.toContain('최근6개월');
  });

  it('스냅샷 최고가를 역대 전고점으로 부르지 않고 엄격한 경신만 표시한다', async () => {
    mocks.getAptPageData.mockResolvedValue(pageData('ok', 'ok', {
      salesMonths: 2,
      rentMonths: 2,
      allTimeHighStatus: 'unavailable',
      salePrices: [110_000, 100_000],
    }));

    let content = await renderAptContent();
    let text = (await collectResolvedText(content)).join('').replace(/\s+/g, '');

    expect(text).toContain('2개월최고가회복률');
    expect(text).toContain('2개월최고실거래가');
    expect(text).not.toContain('2개월전고점회복률');
    expect(text).toContain('기간내최고가경신');

    mocks.getAptPageData.mockResolvedValue(pageData('ok', 'ok', {
      salesMonths: 2,
      rentMonths: 2,
      allTimeHighStatus: 'unavailable',
      salePrices: [100_000, 100_000],
    }));
    content = await renderAptContent();
    text = (await collectResolvedText(content)).join('').replace(/\s+/g, '');

    expect(text).not.toContain('기간내최고가경신');
    expect(text).toContain('최근2개월최고가기준');
  });
});

describe('단지 페이지 색인 메타데이터', () => {
  it.each([
    ['정상 빈 결과', 'ok', 'ok'],
    ['양쪽 원장 장애', 'error', 'error'],
    ['매매 장애와 전월세 빈 결과', 'error', 'ok'],
  ] as const)('%s에는 noindex,follow를 적용한다', async (_label, salesStatus, rentStatus) => {
    mocks.getAptPageData.mockResolvedValue(pageData(salesStatus, rentStatus));

    const metadata = await generateMetadata({ params: Promise.resolve({ id: master.id }) });

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it.each([
    ['매매', { sales: 1 }],
    ['전월세', { rents: 1 }],
  ] as const)('%s 거래가 있으면 index,follow를 적용한다', async (_label, rows) => {
    mocks.getAptPageData.mockResolvedValue(pageData('ok', 'ok', rows));

    const metadata = await generateMetadata({ params: Promise.resolve({ id: master.id }) });

    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(mocks.getAptPageData).toHaveBeenCalledWith(master.id);
  });

  it('메타데이터도 실제 스냅샷 조회 기간을 사용한다', async () => {
    mocks.getAptPageData.mockResolvedValue(pageData('ok', 'ok', {
      sales: 1,
      salesMonths: 2,
      rentMonths: 2,
      allTimeHighStatus: 'unavailable',
    }));

    const metadata = await generateMetadata({ params: Promise.resolve({ id: master.id }) });

    expect(metadata.description).toContain('최근 2개월 시세 차트');
    expect(metadata.description).toContain('2개월 최고가 회복률');
    expect(metadata.description).not.toContain('최근 12개월');
    expect(metadata.description).not.toContain('전고점 회복률');
  });

  it('존재하지 않는 단지도 noindex,follow로 닫는다', async () => {
    mocks.getAptPageData.mockResolvedValue(null);

    const metadata = await generateMetadata({ params: Promise.resolve({ id: 'missing' }) });

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it('검증된 스냅샷을 읽지 못하면 오류 상세를 숨기고 noindex 메타데이터를 반환한다', async () => {
    mocks.getAptPageData.mockRejectedValue(new mocks.AptPageDataUnavailableError());

    const metadata = await generateMetadata({ params: Promise.resolve({ id: master.id }) });

    expect(metadata.title).toBe('단지 상세 일시 점검 중 | 내집 My.ZIP');
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it('예상하지 못한 메타데이터 오류는 숨기지 않는다', async () => {
    const error = new Error('unexpected');
    mocks.getAptPageData.mockRejectedValue(error);

    await expect(generateMetadata({ params: Promise.resolve({ id: master.id }) }))
      .rejects.toBe(error);
  });
});
