// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AptAutocomplete } from '../AptAutocomplete';

interface PendingFetch {
  signal: AbortSignal | undefined;
  resolve: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
}

const pending: PendingFetch[] = [];
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  });
}

beforeEach(() => {
  pending.length = 0;
  vi.useFakeTimers();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise((resolve) => {
      pending.push({
        signal: init?.signal ?? undefined,
        resolve: resolve as PendingFetch['resolve'],
      });
    }),
  ));
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AptAutocomplete request ordering', () => {
  it('입력이 바뀌면 debounce 전에도 직전 요청을 취소하고 늦은 응답을 무시한다', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<AptAutocomplete onSelect={() => undefined} />);
    });

    const input = host.querySelector('input')!;
    await type(input, '현대');
    await act(async () => {
      vi.advanceTimersByTime(300);
      await settle();
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].signal?.aborted).toBe(false);

    await type(input, '래미안');
    expect(pending[0].signal?.aborted).toBe(true);

    await act(async () => {
      pending[0].resolve({
        ok: true,
        json: async () => ({
          results: [{ id: 'old', name: '구형단지', sido: '서울', sigungu: '강남구', dong: '대치동', lawdCd: '11680' }],
        }),
      });
      await settle();
    });
    expect(host.textContent).not.toContain('구형단지');

    await act(async () => {
      vi.advanceTimersByTime(300);
      await settle();
    });
    expect(pending).toHaveLength(2);
    await act(async () => {
      pending[1].resolve({
        ok: true,
        json: async () => ({
          results: [{ id: 'new', name: '래미안', sido: '서울', sigungu: '강남구', dong: '대치동', lawdCd: '11680' }],
        }),
      });
      await settle();
    });

    expect(host.textContent).toContain('래미안');
    expect(host.textContent).not.toContain('구형단지');
  });
});
