// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SkipToContent } from '../SkipToContent';

let root: Root | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('SkipToContent', () => {
  it('수화 전 DOM을 바꾸지 않고 클릭 순간 본문에 포커스를 옮긴다', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <>
          <SkipToContent />
          <main>본문</main>
        </>,
      );
    });

    const main = host.querySelector('main')!;
    const link = host.querySelector('a')!;
    expect(main.hasAttribute('id')).toBe(false);
    expect(main.hasAttribute('tabindex')).toBe(false);

    await act(async () => {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(main.id).toBe('main-content');
    expect(main.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(main);
    expect(main.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });
});
