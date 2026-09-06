import { createMolitRequestGate, type MolitFetchOptions } from './molit-fetch';
import { createMolitRequestScope, MolitRequestStoppedError, runMolitAbortable, throwIfMolitAborted } from './molit-request-control';

// Per web request, not a platform-wide MOLIT quota guarantee. Batch callers do not use this policy.
export const WEB_MOLIT_QUERY_BUDGET_MS = 45_000;
export const WEB_MOLIT_ATTEMPT_TIMEOUT_MS = 8_000;
const MONTH_CONCURRENCY = 3;

export async function fetchWebMolitMonths(
  months: readonly string[],
  fetchMonth: (month: string, options: MolitFetchOptions) => Promise<string>,
  options: { signal: AbortSignal; startedAt: number; allowPartial: boolean },
): Promise<PromiseSettledResult<string>[]> {
  // Include time already spent resolving the snapshot/apartment before live fallback.
  const remainingMs = WEB_MOLIT_QUERY_BUDGET_MS - Math.max(0, Date.now() - options.startedAt);
  const scope = createMolitRequestScope(options.signal, remainingMs);
  const requestGate = createMolitRequestGate({ maxInFlight: 4, minStartIntervalMs: 100, signal: scope.signal });
  const fetchOptions: MolitFetchOptions = {
    signal: scope.signal, timeoutMs: WEB_MOLIT_ATTEMPT_TIMEOUT_MS,
    pageConcurrency: 2, requestGate,
  };
  const results: PromiseSettledResult<string>[] = new Array(months.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < months.length) {
      throwIfMolitAborted(scope.signal);
      const index = nextIndex++;
      try {
        const value = await runMolitAbortable(() => fetchMonth(months[index], fetchOptions), scope.signal);
        throwIfMolitAborted(scope.signal);
        results[index] = { status: 'fulfilled', value };
      } catch (error) {
        throwIfMolitAborted(scope.signal);
        // Cancellation/deadline exhaustion is not a successful partial or zero-row response.
        if (error instanceof MolitRequestStoppedError) throw error;
        if (!options.allowPartial) throw new Error('MOLIT 월별 조회 실패');
        results[index] = { status: 'rejected', reason: new Error('MOLIT 월별 조회 실패') };
      }
    }
  }
  try {
    throwIfMolitAborted(scope.signal);
    await Promise.all(Array.from({ length: Math.min(MONTH_CONCURRENCY, months.length) }, worker));
    throwIfMolitAborted(scope.signal);
    return results;
  } finally {
    scope.abort(); // Fail-fast buy requests also stop siblings and queued/retry/page work.
    scope.dispose();
  }
}
