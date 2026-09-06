/** Closed errors: never forward AbortSignal.reason, fetch URLs or response bodies. */
export class MolitRequestStoppedError extends Error {
  constructor(public readonly reason: 'aborted' | 'budget' | 'attempt-timeout') {
    super(reason === 'budget' ? 'MOLIT 조회 시간 예산 초과'
      : reason === 'attempt-timeout' ? 'MOLIT 요청 시간 초과' : 'MOLIT 조회 취소');
    this.name = 'MolitRequestStoppedError';
  }
}

function stoppedError(signal: AbortSignal): MolitRequestStoppedError {
  return signal.reason instanceof MolitRequestStoppedError
    ? signal.reason : new MolitRequestStoppedError('aborted');
}

export function throwIfMolitAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw stoppedError(signal);
}

/** Also bounds a stalled body/test transport which does not honor the signal itself. */
export function runMolitAbortable<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation();
  if (signal.aborted) return Promise.reject(stoppedError(signal));
  return new Promise<T>((resolve, reject) => {
    const aborted = () => { cleanup(); reject(stoppedError(signal)); };
    const cleanup = () => signal.removeEventListener('abort', aborted);
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => {
      throwIfMolitAborted(signal);
      return operation();
    }).then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

export function molitSleep(ms: number, signal?: AbortSignal, injectedSleep?: (ms: number) => Promise<void>): Promise<void> {
  if (injectedSleep) return runMolitAbortable(() => injectedSleep(ms), signal);
  if (signal?.aborted) return Promise.reject(stoppedError(signal));
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); };
    const aborted = () => { cleanup(); reject(stoppedError(signal!)); };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

export function createMolitRequestScope(parent?: AbortSignal, timeoutMs?: number, reason: 'budget' | 'attempt-timeout' = 'budget') {
  const controller = new AbortController();
  const aborted = () => controller.abort(parent ? stoppedError(parent) : new MolitRequestStoppedError('aborted'));
  if (parent?.aborted) aborted();
  else parent?.addEventListener('abort', aborted, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs !== undefined && !controller.signal.aborted) {
    if (timeoutMs <= 0) controller.abort(new MolitRequestStoppedError(reason));
    else timer = setTimeout(() => controller.abort(new MolitRequestStoppedError(reason)), timeoutMs);
  }
  return {
    signal: controller.signal,
    abort: () => controller.abort(new MolitRequestStoppedError('aborted')),
    dispose: () => { clearTimeout(timer); parent?.removeEventListener('abort', aborted); },
  };
}
