// @vitest-environment jsdom

import { act, type AnchorHTMLAttributes } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import RecentDealsCard from '../RecentDealsCard';
import { HOME_DISTRICT_STORAGE_KEY } from '@/lib/home-district';

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

async function chooseDistrict(card: HTMLElement, group: string, district: string) {
  await act(async () => { [...card.querySelectorAll('button')].find((b) => b.textContent === '지역 변경')!.click(); });
  const selects = card.querySelectorAll('select');
  await act(async () => { selects[0].value = group; selects[0].dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { selects[1].value = district; selects[1].dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { card.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle(); });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  fetchMock.mockReset();
  window.localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RecentDealsCard', () => {
  it('서버 초기 HTML은 기기 저장값을 읽지 않고 hydration 뒤 저장 지역을 한 번 조회한다', async () => {
    window.localStorage.setItem(HOME_DISTRICT_STORAGE_KEY, '홍천군');
    fetchMock.mockResolvedValue(apiResponse(true, 200, { data: [validGroup('홍천 단지')] }));
    const html = renderToString(<RecentDealsCard />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(html).not.toContain('홍천군');
    host = document.createElement('div'); host.innerHTML = html; document.body.appendChild(host);
    const recoverableError = vi.fn();
    await act(async () => { root = hydrateRoot(host!, <RecentDealsCard />, { onRecoverableError: recoverableError }); await settle(); });
    expect(recoverableError).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent('홍천군'));
    expect(host.textContent).toContain('강원 홍천군');
  });
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
    await chooseDistrict(card, '서울', '서초구');

    expect(firstSignal.aborted).toBe(true);
    expect(window.localStorage.getItem(HOME_DISTRICT_STORAGE_KEY)).toBe('서초구');
    expect(card.textContent).toContain('서초 실제 단지');
    expect(fetchMock.mock.calls[1][0]).toContain('district=%EC%84%9C%EC%B4%88%EA%B5%AC');
    expect(linkUrl(transactionLinks(card)[0]).searchParams.get('district')).toBe('서초구');
    expect(card.querySelector('a:not([aria-label])')?.getAttribute('href'))
      .toBe('/transactions?district=%EC%84%9C%EC%B4%88%EA%B5%AC');
  });

  it('저장된 경기 지역으로 첫 조회를 시작하고 서울 기본 조회를 덧붙이지 않는다', async () => {
    window.localStorage.setItem(HOME_DISTRICT_STORAGE_KEY, '용인시 수지구');
    fetchMock.mockResolvedValue(apiResponse(true, 200, { data: [validGroup('수지 단지')] }));
    const card = await renderCard();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent('용인시 수지구'));
    expect(card.textContent).toContain('경기 용인시 수지구');
    expect(linkUrl(transactionLinks(card)[0]).searchParams.get('district')).toBe('용인시 수지구');
  });

  it('지방 선택을 저장하고 다시 마운트해도 그 지역과 링크를 유지한다', async () => {
    fetchMock.mockResolvedValue(apiResponse(true, 200, { data: [validGroup()] }));
    let card = await renderCard();
    await chooseDistrict(card, '부산', '부산 해운대구');
    expect(card.textContent).toContain('부산 해운대구');
    expect(card.querySelector('form')).toBeNull();
    expect(document.activeElement?.textContent).toBe('지역 변경');
    await act(async () => root!.unmount()); root = null; host!.remove();
    card = await renderCard();
    expect(card.textContent).toContain('부산 해운대구');
    expect(linkUrl(transactionLinks(card)[0]).searchParams.get('district')).toBe('부산 해운대구');
  });

  it('권역을 살펴보다 취소하면 저장·추가 조회 없이 원래 지역을 유지한다', async () => {
    fetchMock.mockResolvedValue(apiResponse(true, 200, { data: [validGroup()] }));
    const card = await renderCard();
    await act(async () => { [...card.querySelectorAll('button')].find((b) => b.textContent === '지역 변경')!.click(); });
    const select = card.querySelector('select')!;
    await act(async () => { select.value = '경기'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(card.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    await act(async () => { card.querySelector('form')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(HOME_DISTRICT_STORAGE_KEY)).toBeNull();
    expect(card.querySelector('form')).toBeNull();
    expect(document.activeElement?.textContent).toBe('지역 변경');
  });

  it('저장 실패를 알리되 선택한 지방의 조회는 성공한다', async () => {
    fetchMock.mockResolvedValue(apiResponse(true, 200, { data: [validGroup()] }));
    const card = await renderCard();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await chooseDistrict(card, '제주', '서귀포시');
    expect(card.textContent).toContain('저장을 확인하지 못했지만');
    expect(linkUrl(transactionLinks(card)[0]).searchParams.get('district')).toBe('서귀포시');
  });

  it('다른 탭 지역 변경 후 늦게 온 이전 응답을 섞지 않는다', async () => {
    let resolveOld!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(apiResponse(true, 200, { data: [validGroup('부산 단지')] }));
    const card = await renderCard();
    const firstSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await act(async () => {
      window.localStorage.setItem(HOME_DISTRICT_STORAGE_KEY, '부산 해운대구');
      window.dispatchEvent(new StorageEvent('storage', { key: HOME_DISTRICT_STORAGE_KEY }));
      await settle();
    });
    await act(async () => { resolveOld(apiResponse(true, 200, { data: [validGroup('늦은 서울 단지')] })); await settle(); });
    expect(firstSignal.aborted).toBe(true);
    expect(card.textContent).toContain('부산 단지');
    expect(card.textContent).not.toContain('늦은 서울 단지');
    expect(linkUrl(transactionLinks(card)[0]).searchParams.get('district')).toBe('부산 해운대구');
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
