// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import RecentDealsCard from '../RecentDealsCard';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderCard() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<RecentDealsCard />);
    await settle();
  });
  return host;
}

function apiResponse(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function validGroup(name = '실제 검증 단지') {
  return {
    name,
    dong: '대치동',
    transactions: [{
      dong: '대치동',
      area: 84,
      floor: 12,
      price: 205000,
      date: '2026-08-03',
    }],
  };
}

function transactionLinks(card: HTMLElement): HTMLAnchorElement[] {
  return [...card.querySelectorAll<HTMLAnchorElement>('a[aria-label$="실거래 자세히 보기"]')];
}

function linkUrl(link: HTMLAnchorElement): URL {
  const href = link.getAttribute('href');
  expect(href).toMatch(/^\/transactions\?/);
  return new URL(href!, 'https://www.naezipkorea.com');
}

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

describe('RecentDealsCard', () => {
  it('로딩 중에 하드코딩 실거래 표본을 노출하지 않는다', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const card = await renderCard();

    expect(card.textContent).toContain('최근 실거래를 불러오는 중');
    expect(card.textContent).not.toContain('래미안 대치팰리스');
    expect(card.textContent).not.toContain('34.5억');
    expect(transactionLinks(card)).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC&months=2&limit=60',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('API 오류를 표본으로 덮지 않고 재시도 후 실제 응답만 표시한다', async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse(false, 503, { error: '실거래 원천 점검 중입니다.' }))
      .mockResolvedValueOnce(apiResponse(true, 200, { data: [validGroup()] }));
    const card = await renderCard();

    expect(card.querySelector('[role="alert"]')).not.toBeNull();
    expect(card.textContent).toContain('실거래 원천 점검 중입니다.');
    expect(card.textContent).not.toContain('은마아파트');
    expect(card.textContent).not.toContain('26.8억');
    expect(transactionLinks(card)).toHaveLength(0);

    const retry = [...card.querySelectorAll('button')]
      .find((button) => button.textContent === '다시 시도');
    expect(retry).toBeDefined();
    expect(retry?.getAttribute('type')).toBe('button');
    await act(async () => {
      retry!.click();
      await settle();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(card.textContent).toContain('실제 검증 단지');
    expect(card.textContent).toContain('20.5억');
    expect(card.textContent).toContain('대치동 · 전용 84㎡ · 12층');
    expect(card.textContent).toContain('08.03');
    expect(card.querySelector('[role="alert"]')).toBeNull();
  });

  it('정상 0건과 일부 손상된 응답을 서로 다른 상태로 표시한다', async () => {
    fetchMock.mockResolvedValueOnce(apiResponse(true, 200, { data: [] }));
    let card = await renderCard();
    expect(card.textContent).toContain('최근 2개월에 확인된 강남구 매매 실거래가 없습니다');
    expect(card.querySelector('[role="alert"]')).toBeNull();

    expect(transactionLinks(card)).toHaveLength(0);

    await act(async () => root!.unmount());
    root = null;
    host!.remove();

    fetchMock.mockResolvedValueOnce(apiResponse(true, 200, {
      data: [
        validGroup('부분 검증 단지'),
        { name: '손상 단지', transactions: [{ area: '84', price: null }] },
      ],
    }));
    card = await renderCard();
    expect(card.querySelector('[role="alert"]')).not.toBeNull();
    expect(card.textContent).toContain('일부 거래를 확인하지 못해 검증된 거래만 표시');
    expect(card.textContent).toContain('부분 검증 단지');
    expect(card.textContent).not.toContain('손상 단지');
  });

  it('지역을 바꾸면 이전 요청을 중단하고 선택 상태를 알린다', async () => {
    fetchMock
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(apiResponse(true, 200, { data: [validGroup('서초 실제 단지')] }));
    const card = await renderCard();
    const firstSignal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    const seocho = [...card.querySelectorAll('button')]
      .find((button) => button.textContent === '서초구');
    expect(seocho).toBeDefined();

    await act(async () => {
      seocho!.click();
      await settle();
    });

    expect(firstSignal.aborted).toBe(true);
    expect(seocho?.getAttribute('aria-pressed')).toBe('true');
    expect(card.textContent).toContain('서초 실제 단지');
    expect(fetchMock.mock.calls[1][0]).toContain('district=%EC%84%9C%EC%B4%88%EA%B5%AC');
    expect(linkUrl(transactionLinks(card)[0]).searchParams.get('district')).toBe('서초구');
    expect(card.querySelector('a:not([aria-label])')?.getAttribute('href'))
      .toBe('/transactions?district=%EC%84%9C%EC%B4%88%EA%B5%AC');
  });

  it('유니코드·공백·기호를 보존하며 명시된 마스터와 정확한 계약 건에 연결한다', async () => {
    const group = {
      ...validGroup('  우리집 2차 (A&B)+가든 한강  '),
      id: 'A-looking-display-id',
      masterId: ' A-단지/123+45 ',
      district: ' 용인시 수지구 ',
      dong: ' 성복동 1가 ',
      transactions: [{
        dong: '잘못된 거래행 동', area: 84.95, floor: -1, price: 205049, date: '2026-08-03',
      }],
    };
    fetchMock.mockResolvedValueOnce(apiResponse(true, 200, { data: [group] }));
    const card = await renderCard();
    const links = transactionLinks(card);

    expect(links).toHaveLength(1);
    expect(links[0].tagName).toBe('A');
    expect(links[0].tabIndex).toBe(0);
    expect(links[0].getAttribute('aria-label')).toContain('2026-08-03 계약 84.95㎡ -1층');
    expect(links[0].textContent).toContain('우리집 2차 (A&B)+가든 한강');
    expect(links[0].textContent).toContain('성복동 1가');
    expect(links[0].textContent).not.toContain('잘못된 거래행 동');
    expect(Object.fromEntries(linkUrl(links[0]).searchParams)).toEqual({
      district: '용인시 수지구',
      q: '우리집 2차 (A&B)+가든 한강',
      aptId: 'A-단지/123+45',
      aptDong: '성복동 1가',
      months: '2',
      tx: '2026-08-03_84.95_-1_205049',
    });
    expect(links[0].getAttribute('href')).not.toContain('relative.invalid');
    expect(card.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([undefined, null, '', '   ', 12345, true, {}, ['A12345']])(
    '유효한 문자열 masterId가 없으면 표시용 id를 추정하지 않고 이름·동으로 연결한다 (%j)',
    async (masterId) => {
      const group = {
        ...validGroup('동일 이름 단지'),
        id: 'A12345678',
        masterId,
        district: null,
        dong: ' ',
        transactions: [{
          masterId: 'A-transaction-field', aptId: 'A-guessed-field',
          dong: ' 역삼동 2가 ', area: 59.99, floor: 8, price: 90501, date: '2026-08',
        }],
      };
      fetchMock.mockResolvedValueOnce(apiResponse(true, 200, { data: [group] }));
      const card = await renderCard();
      const url = linkUrl(transactionLinks(card)[0]);

      expect(Object.fromEntries(url.searchParams)).toEqual({
        district: '강남구',
        q: '동일 이름 단지',
        aptDong: '역삼동 2가',
        months: '2',
        tx: '2026-08_59.99_8_90501',
      });
      expect(url.searchParams.has('aptId')).toBe(false);
      expect(card.querySelector('[role="alert"]')).toBeNull();
    },
  );

  it('선택 필드가 잘못된 형식이면 요청 지역으로 폴백하고 없는 동은 URL에서 생략한다', async () => {
    fetchMock.mockResolvedValueOnce(apiResponse(true, 200, {
      data: [{
        ...validGroup(),
        district: { name: '가짜 지역' },
        dong: ['가짜 동'],
        transactions: [{ dong: 123, area: 84, floor: 12, price: 205000, date: '2026-08-03' }],
      }],
    }));
    const card = await renderCard();
    const url = linkUrl(transactionLinks(card)[0]);

    expect(url.searchParams.get('district')).toBe('강남구');
    expect(url.searchParams.has('aptDong')).toBe(false);
    expect(url.searchParams.has('aptId')).toBe(false);
    expect(url.searchParams.get('tx')).toBe('2026-08-03_84_12_205000');
  });

  it('최신 4건을 날짜순으로 표시하고 반올림 전 가격별 계약 링크를 구분한다', async () => {
    const transactions = [
      { area: 84, floor: 12, price: 205000, date: '2026-08-01' },
      { area: 84, floor: 12, price: 205001, date: '2026-08-03' },
      { area: 84, floor: 12, price: 205002, date: '2026-08-03' },
      { area: 84, floor: 12, price: 205003, date: '2026-08-04' },
      { area: 84, floor: 12, price: 205004, date: '2026-08-05' },
    ];
    fetchMock.mockResolvedValueOnce(apiResponse(true, 200, {
      data: [{ ...validGroup(), transactions }],
    }));
    const card = await renderCard();
    const links = transactionLinks(card);

    expect(links).toHaveLength(4);
    expect(links.map((link) => linkUrl(link).searchParams.get('tx'))).toEqual([
      '2026-08-05_84_12_205004',
      '2026-08-04_84_12_205003',
      '2026-08-03_84_12_205001',
      '2026-08-03_84_12_205002',
    ]);
  });

  it('부분 제공 상태에서도 검증된 거래 링크와 안내·재시도를 함께 유지한다', async () => {
    fetchMock.mockResolvedValueOnce(apiResponse(true, 200, {
      status: 'degraded', note: '원천 일부만 제공 중입니다.',
      data: [validGroup('제공 가능한 단지'), { name: '손상 거래', transactions: [null] }],
    }));
    const card = await renderCard();

    expect(card.querySelector('[role="alert"]')?.textContent).toContain('원천 일부만 제공 중입니다.');
    expect(card.textContent).toContain('다시 시도');
    expect(transactionLinks(card)).toHaveLength(1);
    expect(linkUrl(transactionLinks(card)[0]).searchParams.get('q')).toBe('제공 가능한 단지');
    expect(card.textContent).not.toContain('손상 거래');
  });
});
