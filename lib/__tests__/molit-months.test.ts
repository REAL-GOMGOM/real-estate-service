import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMolitXml } = vi.hoisted(() => ({ fetchMolitXml: vi.fn() }));
vi.mock('@/lib/molit-fetch', () => ({ fetchMolitXml }));

import { fetchTradeMonthAllPages, getMonthList, revalidateForMonth } from '@/lib/molit-months';

describe('fetchTradeMonthAllPages', () => {
  beforeEach(() => fetchMolitXml.mockReset());

  it('3,000건을 넘더라도 마지막 페이지까지 수집한다', async () => {
    fetchMolitXml
      .mockResolvedValueOnce('<response><totalCount>3501</totalCount><page>1</page></response>')
      .mockResolvedValueOnce('<response><totalCount>3501</totalCount><page>2</page></response>')
      .mockResolvedValueOnce('<response><totalCount>3501</totalCount><page>3</page></response>')
      .mockResolvedValueOnce('<response><totalCount>3501</totalCount><page>4</page></response>');

    const xml = await fetchTradeMonthAllPages('key', '11680', '202608', 60);

    expect(fetchMolitXml).toHaveBeenCalledTimes(4);
    expect(xml).toContain('<page>4</page>');
  });

  it('추가 페이지 오류를 정상 부분집계로 숨기지 않는다', async () => {
    fetchMolitXml
      .mockResolvedValueOnce('<response><totalCount>1001</totalCount></response>')
      .mockResolvedValueOnce('<OpenAPI_ServiceResponse>error</OpenAPI_ServiceResponse>');

    await expect(fetchTradeMonthAllPages('key', '11680', '202608', 60)).rejects.toThrow(
      '2페이지',
    );
  });

  it('totalCount 0인 정상 무거래 월은 추가 페이지 없이 반환한다', async () => {
    fetchMolitXml.mockResolvedValueOnce(
      '<response><resultCode>000</resultCode><totalCount> 0 </totalCount></response>',
    );
    const fetchOptions = { maxAttempts: 4, baseDelayMs: 750 };

    const xml = await fetchTradeMonthAllPages(
      'key',
      '45190',
      '202608',
      60,
      fetchOptions,
    );

    expect(xml).toContain('<totalCount> 0 </totalCount>');
    expect(fetchMolitXml).toHaveBeenCalledTimes(1);
    expect(fetchMolitXml).toHaveBeenCalledWith(
      expect.stringContaining('LAWD_CD=45190'),
      60,
      fetchOptions,
    );
  });

  it('pageConcurrency=1이면 추가 페이지 요청을 직렬로 시작한다', async () => {
    let resolvePage2!: (xml: string) => void;
    const page2 = new Promise<string>((resolve) => { resolvePage2 = resolve; });
    fetchMolitXml
      .mockResolvedValueOnce('<response><totalCount>2500</totalCount><page>1</page></response>')
      .mockReturnValueOnce(page2)
      .mockResolvedValueOnce('<response><totalCount>2500</totalCount><page>3</page></response>');

    const pending = fetchTradeMonthAllPages('key', '11680', '202608', 60, {
      pageConcurrency: 1,
    });
    await vi.waitFor(() => expect(fetchMolitXml).toHaveBeenCalledTimes(2));
    expect(fetchMolitXml).toHaveBeenCalledTimes(2);

    resolvePage2('<response><totalCount>2500</totalCount><page>2</page></response>');
    await expect(pending).resolves.toContain('<page>3</page>');
    expect(fetchMolitXml).toHaveBeenCalledTimes(3);
  });

  it('잘못된 pageConcurrency 값은 기존 안전 기본값으로 처리한다', async () => {
    fetchMolitXml
      .mockResolvedValueOnce('<response><totalCount>2500</totalCount><page>1</page></response>')
      .mockResolvedValueOnce('<response><totalCount>2500</totalCount><page>2</page></response>')
      .mockResolvedValueOnce('<response><totalCount>2500</totalCount><page>3</page></response>');

    await expect(fetchTradeMonthAllPages('key', '11680', '202608', 60, {
      pageConcurrency: Number.NaN,
    })).resolves.toContain('<page>3</page>');
    expect(fetchMolitXml).toHaveBeenCalledTimes(3);
  });
});

describe('한국 기준 월 계산', () => {
  it('Vercel UTC가 전월이어도 한국 자정 이후에는 새 달을 조회한다', () => {
    const instant = new Date('2026-07-31T15:30:00.000Z');
    expect(getMonthList(2, instant)).toEqual(['202608', '202607']);
    expect(revalidateForMonth('202606', instant)).toBe(604800);
    expect(revalidateForMonth('202607', instant)).toBe(86400);
  });
});
