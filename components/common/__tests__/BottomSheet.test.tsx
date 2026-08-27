// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BottomSheet from '../BottomSheet';

let root: Root | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('BottomSheet', () => {
  it('열린 시트가 전역 내비를 가리고 더 높은 계층을 사용한다고 표시한다', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(
        <BottomSheet isOpen onClose={vi.fn()}>
          <button type="button">상세 동작</button>
        </BottomSheet>,
      );
    });

    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    const backdrop = dialog.previousElementSibling as HTMLElement;

    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.dataset.mobileNavObscures).toBe('true');
    expect(dialog.style.zIndex).toBe('111');
    expect(backdrop.style.zIndex).toBe('110');
  });
});
