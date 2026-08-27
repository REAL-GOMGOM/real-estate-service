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
  it('검색 결과는 pointer down 중 사라지지 않고 완전한 click에서 선택한다', async () => {
    const onSelect = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<AptAutocomplete onSelect={onSelect} />);
    });

    const input = host.querySelector('input')!;
    await type(input, '은하마을');
    await act(async () => {
      vi.advanceTimersByTime(180);
      await settle();
    });
    const apartment = {
      id: 'A42084804',
      name: '중동은하마을주공1단지',
      sido: '경기도',
      sigungu: '부천원미구',
      dong: '중동',
      lawdCd: '41192',
    };
    await act(async () => {
      pending[0].resolve({
        ok: true,
        json: async () => ({ results: [apartment] }),
      });
      await settle();
    });

    const option = host.querySelector('[role="option"]') as HTMLElement;
    await act(async () => {
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await settle();
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(host.querySelector('[role="option"]')).toBe(option);

    await act(async () => {
      option.click();
      await settle();
    });
    expect(onSelect).toHaveBeenCalledWith(apartment);
    expect(host.querySelector('[role="option"]')).toBeNull();
  });

  it('검색어 지우기를 외부 선택 상태에도 알린다', async () => {
    const onClear = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <AptAutocomplete
          initialValue="잠실엘스"
          onClear={onClear}
          onSelect={() => undefined}
        />,
      );
    });

    const input = host.querySelector('input')!;
    const clear = host.querySelector('button[aria-label="검색어 지우기"]') as HTMLButtonElement;
    expect(input.value).toBe('잠실엘스');
    await act(async () => {
      clear.click();
      await settle();
    });

    expect(input.value).toBe('');
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
  });

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
      vi.advanceTimersByTime(179);
      await settle();
    });
    expect(pending).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(1);
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
      vi.advanceTimersByTime(180);
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

  it('공백만 다른 같은 검색어는 5분 캐시를 재사용한다', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<AptAutocomplete onSelect={() => undefined} />);
    });

    const input = host.querySelector('input')!;
    await type(input, '래미안');
    await act(async () => {
      vi.advanceTimersByTime(180);
      await settle();
    });
    await act(async () => {
      pending[0].resolve({
        ok: true,
        json: async () => ({
          results: [{ id: 'cached', name: '래미안', sido: '서울', sigungu: '서초구', dong: '반포동', lawdCd: '11650' }],
        }),
      });
      await settle();
    });

    await type(input, '래미 안');
    await act(async () => {
      vi.advanceTimersByTime(180);
      await settle();
    });

    expect(pending).toHaveLength(1);
    expect(host.textContent).toContain('래미안');
  });
});
