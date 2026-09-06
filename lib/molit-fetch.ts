import { createMolitRequestScope, molitSleep, MolitRequestStoppedError, runMolitAbortable, throwIfMolitAborted } from './molit-request-control';

/**
 * MOLIT 실거래 API fetch 헬퍼.
 *
 * 첫 요청은 기존 Next Data Cache 정책을 그대로 사용한다. 캐시된 오류 XML,
 * HTTP 429/5xx 또는 일시적인 MOLIT 오류가 감지되면 이후 시도만 no-store 로
 * 보내고 지수 백오프와 지터를 적용한다. 오류 메시지에는 URL·응답 본문을
 * 포함하지 않아 serviceKey 가 로그로 유출되지 않게 한다.
 */

type MolitRequestInit = RequestInit & {
  next?: { revalidate: number };
};

export type MolitFetchImplementation = (
  url: string,
  init: MolitRequestInit,
) => Promise<Response>;

export interface MolitFetchOptions {
  /** Web queries opt in; omitted for compatibility with the Mac batch. */
  signal?: AbortSignal;
  /** Per attempt, including response body. Omitted preserves the existing batch behavior. */
  timeoutMs?: number;
  /** 최초 요청을 포함한 총 시도 횟수. */
  maxAttempts?: number;
  /** 첫 재시도 전 기본 지연. */
  baseDelayMs?: number;
  /** 한 번의 재시도 지연 상한. */
  maxDelayMs?: number;
  /** 테스트용 의존성 주입. */
  fetchImpl?: MolitFetchImplementation;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  /** Mac 배치처럼 여러 작업이 같은 API 한도를 공유할 때 사용하는 전역 게이트. */
  requestGate?: MolitRequestGate;
  /** 월별 추가 페이지 동시 조회 수. 웹 기본값은 molit-months의 기존 값(4). */
  pageConcurrency?: number;
}

interface ResponseFailure {
  message: string;
  retryable: boolean;
  kind?: 'rate-limit' | 'service-disabled' | 'daily-quota';
  circuitCode?: '21' | '22' | '23' | 'HTTP_429';
}

export type MolitCircuitReason = 'service-disabled' | 'daily-quota' | 'throttle';

export class MolitCircuitOpenError extends Error {
  constructor(
    public readonly reason: MolitCircuitReason,
    public readonly resultCode: '21' | '22' | '23' | 'HTTP_429',
  ) {
    super(
      reason === 'daily-quota'
        ? 'MOLIT 일일 요청한도 초과(resultCode=22)'
        : reason === 'service-disabled'
          ? 'MOLIT 서비스 일시중지(resultCode=21)'
          : `MOLIT 요청 제한 cooldown 회로 열림(code=${resultCode})`,
    );
    this.name = 'MolitCircuitOpenError';
  }
}

export function isMolitCircuitOpenError(error: unknown): error is MolitCircuitOpenError {
  return error instanceof MolitCircuitOpenError;
}

export interface MolitRequestGate {
  run<T>(request: () => Promise<T>): Promise<T>;
  noteCooldown(delayMs: number): void;
  trip(error: MolitCircuitOpenError): void;
}

export interface MolitRequestGateOptions {
  maxInFlight: number;
  minStartIntervalMs: number;
  /** 단위 테스트용 시계·sleep 주입. */
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  /** Optional query-wide cancellation, including queued requests and cooldown waits. */
  signal?: AbortSignal;
}

// Web routes fail over to snapshot/DB paths, so keep their worst-case latency low.
// The Mac batch explicitly opts into four attempts in scripts/macmini-sync.ts.
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5_000;
const MAX_ATTEMPTS_LIMIT = 6;
const MAX_DELAY_LIMIT_MS = 30_000;

// 공공데이터포털 공통 오류표: 21(서비스키 중지)·22(일일 한도)는 회로를 열어
// 배치를 즉시 중단한다. 23(초당 한도)은 공유 cooldown 후 제한 재시도한다.
// 30~33(미등록·만료·IP·서명)은 재시도로 회복되지 않으므로 포함하지 않는다.
const TRANSIENT_RESULT_CODES = new Set(['1', '2', '4', '5', '23', '99']);
const TRANSIENT_MESSAGE =
  /(RATE|LIMIT|TOO MANY|TIMEOUT|TIMED OUT|TEMPORAR|UNAVAILABLE|BUSY|THROTTL|일시|제한|초과|지연)/i;

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function extractTag(xml: string, ...tags: string[]): string | undefined {
  for (const tag of tags) {
    const value = xml.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`))?.[1]?.trim();
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizedResultCode(resultCode: string): string {
  const trimmed = resultCode.trim();
  if (/^0+$/.test(trimmed)) return '0';
  if (/^\d+$/.test(trimmed)) return trimmed.replace(/^0+/, '');
  return trimmed;
}

function safeResultCode(resultCode: string): string {
  const normalized = normalizedResultCode(resultCode);
  return /^[A-Za-z0-9_-]{1,32}$/.test(normalized) ? normalized : 'unknown';
}

function isTransientResult(resultCode: string, resultMessage?: string): boolean {
  const normalized = normalizedResultCode(resultCode);
  if (TRANSIENT_RESULT_CODES.has(normalized)) return true;
  const numeric = Number(normalized);
  if (Number.isInteger(numeric) && numeric >= 500) return true;
  return resultMessage ? TRANSIENT_MESSAGE.test(resultMessage) : false;
}

function inspectMolitResponse(status: number, ok: boolean, xml: string): ResponseFailure | null {
  const resultCode = extractTag(xml, 'resultCode');
  const resultMessage = extractTag(xml, 'resultMsg', 'resultMessage');

  if (!ok) {
    const normalized = normalizedResultCode(resultCode ?? '');
    const retryableHttp = status === 408 || status === 425 || status === 429 || status >= 500;
    const retryableResult = resultCode
      ? isTransientResult(resultCode, resultMessage)
      : false;
    const resultSuffix = resultCode ? `, resultCode=${safeResultCode(resultCode)}` : '';
    return {
      message: `MOLIT HTTP 오류(status=${status}${resultSuffix})`,
      retryable: retryableHttp || retryableResult,
      kind: normalized === '21'
        ? 'service-disabled'
        : normalized === '22'
          ? 'daily-quota'
          : status === 429 || normalized === '23'
            ? 'rate-limit'
            : undefined,
      circuitCode: normalized === '21'
        ? '21'
        : normalized === '22'
          ? '22'
          : normalized === '23'
            ? '23'
            : status === 429
              ? 'HTTP_429'
              : undefined,
    };
  }

  if (resultCode !== undefined && normalizedResultCode(resultCode) !== '0') {
    const normalized = normalizedResultCode(resultCode);
    if (normalized === '21') {
      return {
        message: 'MOLIT 서비스 일시중지(resultCode=21)',
        retryable: false,
        kind: 'service-disabled',
        circuitCode: '21',
      };
    }
    if (normalized === '22') {
      return {
        message: 'MOLIT 일일 요청한도 초과(resultCode=22)',
        retryable: false,
        kind: 'daily-quota',
        circuitCode: '22',
      };
    }
    return {
      message: `MOLIT API 오류(resultCode=${safeResultCode(resultCode)})`,
      retryable: isTransientResult(resultCode, resultMessage),
      kind: normalized === '23' ? 'rate-limit' : undefined,
      circuitCode: normalized === '23' ? '23' : undefined,
    };
  }

  // 0건도 정상 응답이다. 존재 여부가 아니라 숫자 형식만 검사한다.
  if (!/<totalCount>\s*\d+\s*<\/totalCount>/.test(xml)) {
    return {
      message: 'MOLIT 응답 형식 오류(totalCount 누락)',
      retryable: true,
    };
  }

  return null;
}

function retryDelayMs(
  retryIndex: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
): number {
  const jitter = Math.min(1, Math.max(0, random())) * baseDelayMs;
  return Math.min(maxDelayMs, Math.round(baseDelayMs * 2 ** retryIndex + jitter));
}

export function createMolitRequestGate({
  maxInFlight,
  minStartIntervalMs,
  now = Date.now,
  sleep,
  signal,
}: MolitRequestGateOptions): MolitRequestGate {
  const concurrency = boundedInteger(maxInFlight, 1, 1, 16);
  const intervalMs = boundedInteger(minStartIntervalMs, 0, 0, 60_000);
  let active = 0;
  let lastStartAt = Number.NEGATIVE_INFINITY;
  let cooldownUntil = 0;
  let circuitError: MolitCircuitOpenError | null = null;
  let draining = false;
  const queue: Array<{
    resolve: (release: () => void) => void;
    reject: (error: Error) => void;
  }> = [];

  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      while (!circuitError && active < concurrency && queue.length > 0) {
        throwIfMolitAborted(signal);
        const waitUntil = Math.max(cooldownUntil, lastStartAt + intervalMs);
        const delayMs = Math.max(0, waitUntil - now());
        if (delayMs > 0) {
          await molitSleep(delayMs, signal, sleep);
          continue;
        }
        const waiter = queue.shift()!;
        active++;
        lastStartAt = now();
        let released = false;
        waiter.resolve(() => {
          if (released) return;
          released = true;
          active--;
          void drain();
        });
      }
    } catch (error) {
      for (const waiter of queue.splice(0)) waiter.reject(error as Error);
    } finally {
      draining = false;
      if (!signal?.aborted && !circuitError && active < concurrency && queue.length > 0) void drain();
    }
  };

  return {
    async run<T>(request: () => Promise<T>): Promise<T> {
      throwIfMolitAborted(signal);
      if (circuitError) throw circuitError;
      const release = await runMolitAbortable(() => new Promise<() => void>((resolve, reject) => {
        queue.push({ resolve, reject });
        void drain();
      }), signal);
      try {
        throwIfMolitAborted(signal);
        return await request();
      } finally {
        release();
      }
    },
    noteCooldown(delayMs: number) {
      const safeDelayMs = boundedInteger(delayMs, 10_000, 0, 60_000);
      cooldownUntil = Math.max(cooldownUntil, now() + safeDelayMs);
    },
    trip(error: MolitCircuitOpenError) {
      if (circuitError) return;
      circuitError = error;
      for (const waiter of queue.splice(0)) waiter.reject(error);
    },
  };
}

function retryAfterMs(response: Response): number {
  const raw = response.headers.get('retry-after')?.trim();
  if (!raw) return 10_000;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    return Math.min(60_000, Math.max(0, Math.ceil(Number(raw) * 1_000)));
  }
  const date = Date.parse(raw);
  if (!Number.isFinite(date)) return 10_000;
  return Math.min(60_000, Math.max(0, date - Date.now()));
}

export async function fetchMolitXml(
  url: string,
  revalidate: number,
  options: MolitFetchOptions = {},
): Promise<string> {
  const maxAttempts = boundedInteger(
    options.maxAttempts,
    DEFAULT_MAX_ATTEMPTS,
    1,
    MAX_ATTEMPTS_LIMIT,
  );
  const baseDelayMs = boundedInteger(
    options.baseDelayMs,
    DEFAULT_BASE_DELAY_MS,
    0,
    MAX_DELAY_LIMIT_MS,
  );
  const maxDelayMs = Math.max(
    baseDelayMs,
    boundedInteger(
      options.maxDelayMs,
      DEFAULT_MAX_DELAY_MS,
      0,
      MAX_DELAY_LIMIT_MS,
    ),
  );
  const fetchImpl = options.fetchImpl ?? (fetch as MolitFetchImplementation);
  const sleep = options.sleep;
  const random = options.random ?? Math.random;
  const requestGate = options.requestGate;

  let lastFailure: ResponseFailure = {
    message: 'MOLIT 네트워크 오류',
    retryable: true,
  };
  let attemptsUsed = 0;
  let timedOut = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    throwIfMolitAborted(options.signal);
    attemptsUsed = attempt + 1;
    try {
      const executeAttempt = async () => {
        throwIfMolitAborted(options.signal);
        const timeoutMs = options.timeoutMs === undefined ? undefined
          : boundedInteger(options.timeoutMs, 8_000, 1, 60_000);
        const scope = options.signal || timeoutMs !== undefined
          ? createMolitRequestScope(options.signal, timeoutMs, 'attempt-timeout') : null;
        try {
          const response = await runMolitAbortable(() => fetchImpl(
            url,
            { ...(attempt === 0
              ? { next: { revalidate } }
              : { cache: 'no-store' as const }), ...(scope ? { signal: scope.signal } : {}) },
          ), scope?.signal);
          const xml = await runMolitAbortable(() => response.text(), scope?.signal);
          throwIfMolitAborted(scope?.signal);
          const failure = inspectMolitResponse(response.status, response.ok, xml);
          if (failure?.kind === 'rate-limit') {
            requestGate?.noteCooldown(retryAfterMs(response));
          } else if (failure?.kind === 'service-disabled' || failure?.kind === 'daily-quota') {
            const error = new MolitCircuitOpenError(failure.kind, failure.circuitCode!);
            requestGate?.trip(error);
            throw error;
          }
          return { xml, failure };
        } finally {
          scope?.dispose();
        }
      };
      const { xml, failure } = requestGate
        ? await runMolitAbortable(() => requestGate.run(executeAttempt), options.signal)
        : await executeAttempt();
      if (!failure) return xml;
      timedOut = false;
      lastFailure = failure;
    } catch (error) {
      throwIfMolitAborted(options.signal);
      if (isMolitCircuitOpenError(error)) throw error;
      if (error instanceof MolitRequestStoppedError && error.reason !== 'attempt-timeout') throw error;
      timedOut = error instanceof MolitRequestStoppedError && error.reason === 'attempt-timeout';
      // fetch/본문 읽기 오류 메시지는 URL(serviceKey)을 포함할 수 있어 버린다.
      lastFailure = { message: 'MOLIT 네트워크 오류', retryable: true };
    }

    if (!lastFailure.retryable || attempt === maxAttempts - 1) break;
    await molitSleep(retryDelayMs(attempt, baseDelayMs, maxDelayMs, random), options.signal, sleep);
  }

  if (lastFailure.kind === 'rate-limit' && requestGate) {
    const error = new MolitCircuitOpenError(
      'throttle',
      lastFailure.circuitCode === '23' ? '23' : 'HTTP_429',
    );
    requestGate.trip(error);
    throw error;
  }

  if (timedOut) throw new MolitRequestStoppedError('attempt-timeout');
  throw new Error(`${lastFailure.message} (${attemptsUsed}회 시도 후 실패)`);
}
