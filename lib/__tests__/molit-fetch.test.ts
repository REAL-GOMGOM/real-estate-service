import { describe, expect, it, vi } from 'vitest';

import {
  createMolitRequestGate,
  fetchMolitXml,
  MolitCircuitOpenError,
  type MolitFetchImplementation,
} from '@/lib/molit-fetch';

const validXml = (totalCount = 1, resultCode = '000') =>
  `<response><header><resultCode>${resultCode}</resultCode><resultMsg>OK</resultMsg></header><body><totalCount>${totalCount}</totalCount></body></response>`;

function fetchMock(...responses: Array<Response | Error>): MolitFetchImplementation {
  return vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error('unexpected fetch');
    if (response instanceof Error) throw response;
    return response;
  });
}

describe('fetchMolitXml', () => {
  it('정상 첫 요청은 기존 Next revalidate 캐시를 그대로 사용한다', async () => {
    const fetchImpl = fetchMock(new Response(validXml(3)));
    const sleep = vi.fn(async (_delayMs: number) => undefined);

    await expect(fetchMolitXml('https://example.test/?serviceKey=secret', 86400, {
      fetchImpl,
      sleep,
    })).resolves.toContain('<totalCount>3</totalCount>');

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/?serviceKey=secret',
      { next: { revalidate: 86400 } },
    );
    expect(sleep).not.toHaveBeenCalled();
  });

  it('HTTP 일시 오류는 no-store로 지수 백오프·지터 재시도한다', async () => {
    const fetchImpl = fetchMock(
      new Response('<html>rate limited</html>', { status: 429 }),
      new Response('<response>busy</response>', { status: 503 }),
      new Response(validXml(0)),
    );
    const sleep = vi.fn(async (_delayMs: number) => undefined);

    await expect(fetchMolitXml('https://example.test/?serviceKey=secret', 60, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      random: () => 0.5,
      fetchImpl,
      sleep,
    })).resolves.toContain('<totalCount>0</totalCount>');

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, expect.any(String), {
      next: { revalidate: 60 },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(2, expect.any(String), {
      cache: 'no-store',
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(3, expect.any(String), {
      cache: 'no-store',
    });
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([150, 250]);
  });

  it('MOLIT resultCode와 resultMsg를 검사해 일시 오류만 재시도한다', async () => {
    const fetchImpl = fetchMock(
      new Response(
        '<response><resultCode>CUSTOM</resultCode><resultMsg>Temporarily unavailable</resultMsg></response>',
      ),
      new Response(validXml(2, '00')),
    );
    const sleep = vi.fn(async (_delayMs: number) => undefined);

    await expect(fetchMolitXml('https://example.test/', 10, {
      fetchImpl,
      sleep,
      random: () => 0,
    })).resolves.toContain('<totalCount>2</totalCount>');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['21', 'service-disabled'],
    ['22', 'daily-quota'],
  ] as const)('공공데이터포털 회로 코드 %s는 typed 오류로 즉시 중단한다', async (code, reason) => {
    const fetchImpl = fetchMock(new Response(
      `<response><resultCode>${code}</resultCode><resultMsg>gateway error</resultMsg></response>`,
    ));
    const gate = createMolitRequestGate({ maxInFlight: 1, minStartIntervalMs: 0 });

    const error = await fetchMolitXml('https://example.test/', 10, {
      maxAttempts: 4,
      fetchImpl,
      requestGate: gate,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MolitCircuitOpenError);
    expect(error).toMatchObject({ reason, resultCode: code });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await expect(fetchMolitXml('https://example.test/', 10, {
      fetchImpl,
      requestGate: gate,
    })).rejects.toMatchObject({ reason, resultCode: code });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('HTTP 429 Retry-After를 공유 cooldown에 우선 적용한다', async () => {
    let now = 0;
    const gateSleep = vi.fn(async (delayMs: number) => { now += delayMs; });
    const retrySleep = vi.fn(async (delayMs: number) => { now += delayMs; });
    const gate = createMolitRequestGate({
      maxInFlight: 1,
      minStartIntervalMs: 0,
      now: () => now,
      sleep: gateSleep,
    });
    const fetchImpl = fetchMock(
      new Response('<html>limited</html>', {
        status: 429,
        headers: { 'Retry-After': '2' },
      }),
      new Response(validXml(0)),
    );

    await expect(fetchMolitXml('https://example.test/', 10, {
      maxAttempts: 2,
      baseDelayMs: 100,
      random: () => 0,
      fetchImpl,
      sleep: retrySleep,
      requestGate: gate,
    })).resolves.toContain('<totalCount>0</totalCount>');

    expect(retrySleep).toHaveBeenCalledWith(100);
    expect(gateSleep).toHaveBeenCalledWith(1_900);
  });

  it('HTTP-date Retry-After도 공유 cooldown으로 해석한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T00:00:00.000Z'));
    let now = Date.now();
    const gateSleep = vi.fn(async (delayMs: number) => { now += delayMs; });
    const retrySleep = vi.fn(async (delayMs: number) => { now += delayMs; });
    const gate = createMolitRequestGate({
      maxInFlight: 1,
      minStartIntervalMs: 0,
      now: () => now,
      sleep: gateSleep,
    });
    const fetchImpl = fetchMock(
      new Response('<html>limited</html>', {
        status: 429,
        headers: { 'Retry-After': 'Thu, 13 Aug 2026 00:00:03 GMT' },
      }),
      new Response(validXml(0)),
    );

    await expect(fetchMolitXml('https://example.test/', 10, {
      maxAttempts: 2,
      baseDelayMs: 100,
      random: () => 0,
      fetchImpl,
      sleep: retrySleep,
      requestGate: gate,
    })).resolves.toContain('<totalCount>0</totalCount>');
    expect(gateSleep).toHaveBeenCalledWith(2_900);
    vi.useRealTimers();
  });

  it('429 재시도 소진 시 throttle 회로를 열어 후속 작업을 막는다', async () => {
    let now = 0;
    const advance = async (delayMs: number) => { now += delayMs; };
    const gate = createMolitRequestGate({
      maxInFlight: 1,
      minStartIntervalMs: 0,
      now: () => now,
      sleep: advance,
    });
    const fetchImpl = fetchMock(
      new Response('', { status: 429 }),
      new Response('', { status: 429 }),
    );

    await expect(fetchMolitXml('https://example.test/', 10, {
      maxAttempts: 2,
      baseDelayMs: 0,
      fetchImpl,
      sleep: advance,
      requestGate: gate,
    })).rejects.toMatchObject({ reason: 'throttle', resultCode: 'HTTP_429' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await expect(gate.run(async () => undefined)).rejects.toMatchObject({
      reason: 'throttle',
    });
  });

  it('code 23은 기본 10초 cooldown 후 재시도한다', async () => {
    let now = 0;
    const gateSleep = vi.fn(async (delayMs: number) => { now += delayMs; });
    const retrySleep = vi.fn(async (delayMs: number) => { now += delayMs; });
    const gate = createMolitRequestGate({
      maxInFlight: 1,
      minStartIntervalMs: 0,
      now: () => now,
      sleep: gateSleep,
    });
    const fetchImpl = fetchMock(
      new Response('<response><resultCode>23</resultCode><resultMsg>LIMITED</resultMsg></response>'),
      new Response(validXml(0)),
    );

    await expect(fetchMolitXml('https://example.test/', 10, {
      maxAttempts: 2,
      baseDelayMs: 100,
      random: () => 0,
      fetchImpl,
      sleep: retrySleep,
      requestGate: gate,
    })).resolves.toContain('<totalCount>0</totalCount>');
    expect(gateSleep).toHaveBeenCalledWith(9_900);
  });

  it.each([
    ['21', 'service-disabled'],
    ['22', 'daily-quota'],
  ] as const)('HTTP 오류 본문의 회로 코드 %s도 보존한다', async (code, reason) => {
    const fetchImpl = fetchMock(new Response(
      `<response><resultCode>${code}</resultCode><resultMsg>blocked</resultMsg></response>`,
      { status: 503 },
    ));
    const gate = createMolitRequestGate({ maxInFlight: 1, minStartIntervalMs: 0 });

    await expect(fetchMolitXml('https://example.test/', 10, {
      maxAttempts: 4,
      fetchImpl,
      requestGate: gate,
    })).rejects.toMatchObject({ reason, resultCode: code });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('공유 게이트는 동시 요청을 직렬화하고 시작 간격을 보장한다', async () => {
    let now = 0;
    const gateSleep = vi.fn(async (delayMs: number) => { now += delayMs; });
    const gate = createMolitRequestGate({
      maxInFlight: 1,
      minStartIntervalMs: 500,
      now: () => now,
      sleep: gateSleep,
    });
    let releaseFirst!: () => void;
    const firstDone = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const starts: number[] = [];

    const first = gate.run(async () => {
      starts.push(now);
      await firstDone;
    });
    const second = gate.run(async () => { starts.push(now); });
    await Promise.resolve();
    expect(starts).toEqual([0]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(starts).toEqual([0, 500]);
    expect(gateSleep).toHaveBeenCalledWith(500);
  });

  it('인증 오류는 재시도하지 않고 URL·응답 본문을 오류에 노출하지 않는다', async () => {
    const secret = 'TOP_SECRET_SERVICE_KEY';
    const fetchImpl = fetchMock(new Response(
      `<response><resultCode>30</resultCode><resultMsg>${secret} is invalid</resultMsg></response>`,
    ));
    const sleep = vi.fn(async (_delayMs: number) => undefined);

    let error: unknown;
    try {
      await fetchMolitXml(`https://example.test/?serviceKey=${secret}`, 10, {
        fetchImpl,
        sleep,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error('expected fetchMolitXml to fail');
    expect(error.message).toBe('MOLIT API 오류(resultCode=30) (1회 시도 후 실패)');
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain('example.test');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('네트워크/비정상 본문 오류도 정해진 횟수 뒤 안전한 메시지로 실패한다', async () => {
    const secret = 'LEAK_ME_NOT';
    const fetchImpl = fetchMock(
      new Error(`failed https://example.test/?serviceKey=${secret}`),
      new Response(`<html>${secret}</html>`),
    );

    let error: unknown;
    try {
      await fetchMolitXml(`https://example.test/?serviceKey=${secret}`, 10, {
        baseDelayMs: 0,
        fetchImpl,
        sleep: async () => undefined,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error('expected fetchMolitXml to fail');
    expect(error.message).toBe('MOLIT 응답 형식 오류(totalCount 누락) (2회 시도 후 실패)');
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain('<html>');
  });

  it('성공 코드와 totalCount 0인 정상 무거래 응답을 실패로 취급하지 않는다', async () => {
    const fetchImpl = fetchMock(new Response(validXml(0, '000')));

    await expect(fetchMolitXml('https://example.test/', 10, {
      fetchImpl,
    })).resolves.toContain('<totalCount>0</totalCount>');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
