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
}

interface ResponseFailure {
  message: string;
  retryable: boolean;
}

// Web routes fail over to snapshot/DB paths, so keep their worst-case latency low.
// The Mac batch explicitly opts into four attempts in scripts/macmini-sync.ts.
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5_000;
const MAX_ATTEMPTS_LIMIT = 6;
const MAX_DELAY_LIMIT_MS = 30_000;

// 공공데이터포털 공통 오류표: 21은 서비스키 일시중지, 22는 요청한도 초과.
// 30~33(미등록·만료·IP·서명)은 재시도로 회복되지 않으므로 포함하지 않는다.
const TRANSIENT_RESULT_CODES = new Set(['1', '2', '4', '5', '21', '22', '99']);
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
    const retryableHttp = status === 408 || status === 425 || status === 429 || status >= 500;
    const retryableResult = resultCode
      ? isTransientResult(resultCode, resultMessage)
      : false;
    const resultSuffix = resultCode ? `, resultCode=${safeResultCode(resultCode)}` : '';
    return {
      message: `MOLIT HTTP 오류(status=${status}${resultSuffix})`,
      retryable: retryableHttp || retryableResult,
    };
  }

  if (resultCode !== undefined && normalizedResultCode(resultCode) !== '0') {
    return {
      message: `MOLIT API 오류(resultCode=${safeResultCode(resultCode)})`,
      retryable: isTransientResult(resultCode, resultMessage),
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

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

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
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  let lastFailure: ResponseFailure = {
    message: 'MOLIT 네트워크 오류',
    retryable: true,
  };
  let attemptsUsed = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attemptsUsed = attempt + 1;
    try {
      const response = await fetchImpl(
        url,
        attempt === 0
          ? { next: { revalidate } }
          : { cache: 'no-store' },
      );
      const xml = await response.text();
      const failure = inspectMolitResponse(response.status, response.ok, xml);
      if (!failure) return xml;
      lastFailure = failure;
    } catch {
      // fetch/본문 읽기 오류 메시지는 URL(serviceKey)을 포함할 수 있어 버린다.
      lastFailure = { message: 'MOLIT 네트워크 오류', retryable: true };
    }

    if (!lastFailure.retryable || attempt === maxAttempts - 1) break;
    await sleep(retryDelayMs(attempt, baseDelayMs, maxDelayMs, random));
  }

  throw new Error(`${lastFailure.message} (${attemptsUsed}회 시도 후 실패)`);
}
