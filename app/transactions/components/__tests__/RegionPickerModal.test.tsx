// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegionPickerModal from '../RegionPickerModal';

let root: Root | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('RegionPickerModal supported counties', () => {
  it('includes and can select Hongcheon in the restored Gangwon picker', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const onPick = vi.fn();
    await act(async () => {
      root!.render(<RegionPickerModal initialLabel="강원" activeDistrict="홍천군" onPick={onPick} onClose={() => undefined} />);
    });
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.some((button) => button.textContent === '강원 전체 보기')).toBe(true);
    expect(buttons.some((button) => button.textContent === '강남구')).toBe(false);
    const hongcheon = buttons.find((button) => button.textContent === '홍천군');
    expect(hongcheon).toBeDefined();
    await act(async () => { hongcheon!.click(); });
    expect(onPick).toHaveBeenCalledWith('홍천군');
  });
});
