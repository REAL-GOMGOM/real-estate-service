import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWebMolitMonths, WEB_MOLIT_QUERY_BUDGET_MS } from '../molit-web-query';
import { fetchTradeMonthAllPages, getMonthList, revalidateForMonth } from '../molit-months';
import { MolitRequestStoppedError } from '../molit-request-control';
import type { MolitFetchOptions } from '../molit-fetch';

describe('bounded web MOLIT queries (no external requests)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-06T00:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  it('36개월에서도 동시에 처리하는 월은 3개 이하이고 순서를 보존한다', async () => {
    let active = 0;
    let maximum = 0;
    const months = getMonthList(36);
    const fetchMonth = vi.fn(async (month: string, options: MolitFetchOptions) => {
      expect(options).toMatchObject({ timeoutMs: 8_000, pageConcurrency: 2 });
      expect(options.signal).toBeInstanceOf(AbortSignal);
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return month;
    });
    const pending = fetchWebMolitMonths(months, fetchMonth, {
      signal: new AbortController().signal, startedAt: Date.now(), allowPartial: false,
    });
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(months.map((value) => ({ status: 'fulfilled', value })));
    expect(fetchMonth).toHaveBeenCalledTimes(36);
    expect(maximum).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('여러 월의 페이지·재시도는 요청당 공통 gate 4개/시작간격100ms와 월별 page2를 지킨다', async () => {
    let active = 0;
    let maximum = 0;
    const activeByMonth = new Map<string, number>();
    const maxima = new Map<string, number>();
    const starts: number[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      const month = params.get('DEAL_YMD')!;
      starts.push(Date.now());
      maximum = Math.max(maximum, ++active);
      activeByMonth.set(month, (activeByMonth.get(month) ?? 0) + 1);
      maxima.set(month, Math.max(maxima.get(month) ?? 0, activeByMonth.get(month)!));
      await new Promise((resolve) => setTimeout(resolve, 600));
      active--;
      activeByMonth.set(month, activeByMonth.get(month)! - 1);
      return new Response(`<response><totalCount>5001</totalCount><page>${params.get('pageNo')}</page></response>`);
    });
    const pending = fetchWebMolitMonths(getMonthList(3), (month, options) =>
      fetchTradeMonthAllPages('test-key', '11680', month, revalidateForMonth(month), { ...options, fetchImpl }), {
      signal: new AbortController().signal, startedAt: Date.now(), allowPartial: false,
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(result).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(18);
    expect(maximum).toBe(4);
    expect([...maxima.values()].every((value) => value <= 2)).toBe(true);
    expect(starts.slice(1).every((value, index) => value - starts[index] >= 100)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])('전체 예산은 snapshot 소요시간을 차감하고 partial=%s라도 초과를 성공으로 바꾸지 않는다', async (allowPartial) => {
    const signals: AbortSignal[] = [];
    const fetchMonth = vi.fn((month: string, options: MolitFetchOptions) => {
      signals.push(options.signal!);
      return month === '202609' ? Promise.resolve('<totalCount>0</totalCount>') : new Promise<string>(() => {});
    });
    const startedAt = Date.now() - (WEB_MOLIT_QUERY_BUDGET_MS - 1_000);
    const result = fetchWebMolitMonths(getMonthList(36), fetchMonth, {
      signal: new AbortController().signal, startedAt, allowPartial,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await result).toMatchObject({ reason: 'budget' });
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    const started = fetchMonth.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMonth).toHaveBeenCalledTimes(started);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('시작 전에 예산이 소진되면 요청을 전혀 만들지 않는다', async () => {
    const fetchMonth = vi.fn();
    await expect(fetchWebMolitMonths(getMonthList(36), fetchMonth, {
      signal: new AbortController().signal, startedAt: Date.now() - WEB_MOLIT_QUERY_BUDGET_MS, allowPartial: true,
    })).rejects.toMatchObject({ reason: 'budget' });
    expect(fetchMonth).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('취소는 성공한 월이 있어도 partial을 반환하지 않고 이후 월 시작을 막는다', async () => {
    const controller = new AbortController();
    const fetchMonth = vi.fn((month: string) => month === '202609'
      ? Promise.resolve('<totalCount>0</totalCount>') : new Promise<string>(() => {}));
    const result = fetchWebMolitMonths(getMonthList(36), fetchMonth, {
      signal: controller.signal, startedAt: Date.now(), allowPartial: true,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    const started = fetchMonth.mock.calls.length;
    controller.abort(new Error('https://example.test/?serviceKey=secret'));
    const error = await result;
    expect(error).toMatchObject({ reason: 'aborted', message: 'MOLIT 조회 취소' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMonth).toHaveBeenCalledTimes(started);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('매매 1개월 실패는 형제 요청을 중단하며 일부 성공으로 반환하지 않는다', async () => {
    const signals: AbortSignal[] = [];
    const fetchMonth = vi.fn((month: string, options: MolitFetchOptions) => {
      signals.push(options.signal!);
      return month === '202609' ? Promise.reject(new Error('serviceKey=secret')) : new Promise<string>(() => {});
    });
    await expect(fetchWebMolitMonths(getMonthList(36), fetchMonth, {
      signal: new AbortController().signal, startedAt: Date.now(), allowPartial: false,
    })).rejects.toThrow('MOLIT 월별 조회 실패');
    expect(fetchMonth.mock.calls.length).toBeLessThanOrEqual(3);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('일반 월별 실패는 부분 응답의 원래 위치를 보존하되 timeout 소진은 전체 실패다', async () => {
    const options = { signal: new AbortController().signal, startedAt: Date.now(), allowPartial: true };
    const partial = await fetchWebMolitMonths(['202609', '202608'], (month) =>
      month === '202609' ? Promise.resolve('ok') : Promise.reject(new Error('HTTP 500')), options);
    expect(partial.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    await expect(fetchWebMolitMonths(['202609', '202608'], (month) =>
      month === '202609' ? Promise.resolve('ok') : Promise.reject(new MolitRequestStoppedError('attempt-timeout')), options))
      .rejects.toMatchObject({ reason: 'attempt-timeout' });
  });
});
