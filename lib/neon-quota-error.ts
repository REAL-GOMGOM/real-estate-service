const NEON_QUOTA_MESSAGE =
  /(?:exceed(?:ed|s|ing)?.{0,80}(?:data\s+transfer\s+)?quota|(?:data\s+transfer\s+)?quota.{0,80}exceed(?:ed|s|ing)?|\bHTTP\b[^\n]{0,40}\b402\b)/i;

/**
 * Neon HTTP 드라이버가 반환하는 오류 형태는 fetch/드라이버 버전에 따라 다르다.
 * 상태 코드와 제한된 cause/response 체인만 확인해 순환 참조나 대형 응답 순회를 피한다.
 */
export function isNeonQuotaError(error: unknown): boolean {
  const queue: unknown[] = [error];
  const seen = new Set<object>();

  while (queue.length > 0) {
    const current = queue.shift();

    if (typeof current === 'string') {
      if (NEON_QUOTA_MESSAGE.test(current)) return true;
      continue;
    }

    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);

    const record = current as Record<string, unknown>;
    if (record.status === 402 || record.statusCode === 402 || record.status === '402' || record.statusCode === '402') {
      return true;
    }

    for (const key of ['message', 'code']) {
      if (typeof record[key] === 'string' && NEON_QUOTA_MESSAGE.test(record[key])) return true;
    }

    for (const key of ['cause', 'response', 'error']) {
      if (record[key] !== undefined) queue.push(record[key]);
    }
  }

  return false;
}
