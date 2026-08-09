// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomeCalculator from '../HomeCalculator';

const fetchMock = vi.fn();
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderCalculator() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<HomeCalculator />);
    await settle();
  });
  return host;
}

function response(ok: boolean, body: unknown) {
  return Promise.resolve({ ok, json: async () => body });
}

function rateInput(card: HTMLElement) {
  return card.querySelector<HTMLInputElement>('input[aria-label="대출 금리"]')!;
}

function rateSource(card: HTMLElement) {
  return card.querySelector<HTMLElement>('#home-calculator-rate-source')!;
}

function setRangeValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!valueSetter) throw new Error('HTMLInputElement value setter is unavailable');
  valueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('HomeCalculator rate source truthfulness', () => {
  it('공시 API 실패 시 4.2%를 라이브 금리가 아닌 계산용 예시로 표시한다', async () => {
    fetchMock.mockReturnValue(response(false, { error: 'temporary ECOS failure' }));

    const card = await renderCalculator();

    expect(rateInput(card).value).toBe('4.2');
    expect(rateInput(card).getAttribute('aria-valuetext')).toBe('4.2%');
    expect(rateSource(card).textContent).toContain('계산용 예시값');
    expect(rateSource(card).textContent).not.toContain('ECOS 최신 공시');
  });

  it('유효한 ECOS 최신 금리를 반영하고 라이브 출처를 표시한다', async () => {
    fetchMock.mockReturnValue(response(true, {
      cofix: {
        points: [
          { period: '202606', rate: 4.6 },
          { period: '202607', rate: 4.8 },
        ],
      },
    }));

    const card = await renderCalculator();

    expect(rateInput(card).value).toBe('4.8');
    expect(rateInput(card).getAttribute('aria-valuetext')).toBe('4.8%');
    expect(rateSource(card).textContent).toContain('한국은행 ECOS 최신 공시');
    expect(rateSource(card).textContent).not.toContain('계산용 예시값');
  });

  it('사용자가 금리를 입력하면 수동값으로 표시하고 늦게 온 공시가 덮어쓰지 않는다', async () => {
    let resolveRate!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const delayedRate = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      resolveRate = resolve;
    });
    fetchMock.mockReturnValue(delayedRate);

    const card = await renderCalculator();
    const input = rateInput(card);

    await act(async () => {
      setRangeValue(input, '5.1');
      await settle();
    });

    expect(input.value).toBe('5.1');
    expect(rateSource(card).textContent).toContain('사용자가 입력한 가정값');

    await act(async () => {
      resolveRate({
        ok: true,
        json: async () => ({ cofix: { points: [{ period: '202607', rate: 3.3 }] } }),
      });
      await settle();
    });

    expect(input.value).toBe('5.1');
    expect(input.getAttribute('aria-valuetext')).toBe('5.1%');
    expect(rateSource(card).textContent).toContain('사용자가 입력한 가정값');
    expect(rateSource(card).textContent).not.toContain('ECOS 최신 공시');
  });
});
