import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getAptPageData: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/apt-detail', () => ({
  APT_PAGE_MONTHS: 12,
  APT_RENT_MONTHS: 6,
  getAptPageData: mocks.getAptPageData,
}));
vi.mock('@/components/layout/Header', () => ({ default: () => null }));
vi.mock('@/components/layout/Footer', () => ({ default: () => null }));
vi.mock('@/components/apt/PriceComboChart', () => ({ default: () => null }));

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
  { sales = 0, rents = 0 }: { sales?: number; rents?: number } = {},
) {
  return {
    master,
    district: '강남구',
    group: {
      id: master.id, name: master.name, district: '강남구', dong: master.dong,
      buildYear: null, households: master.totalHouseholds, areas: [],
      transactions: Array.from({ length: sales }, () => ({ price: 100_000 })),
    },
    allTimeHigh: null,
    recentJeonse: [],
    rentTransactions: Array.from({ length: rents }, () => ({ deposit: 50_000 })),
    aptScore: null,
    transactionsStatus,
    rentStatus,
    allTimeHighStatus: 'ok' as const,
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

  it('존재하지 않는 단지도 noindex,follow로 닫는다', async () => {
    mocks.getAptPageData.mockResolvedValue(null);

    const metadata = await generateMetadata({ params: Promise.resolve({ id: 'missing' }) });

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
