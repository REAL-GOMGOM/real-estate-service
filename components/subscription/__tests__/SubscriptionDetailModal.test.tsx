// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SubscriptionDetailModal from '../SubscriptionDetailModal';
import type { SubscriptionItem } from '@/lib/types';

const item: SubscriptionItem = {
  id: 'subscription-1',
  name: '내집 테스트 청약',
  district: '서울 강남구',
  address: '서울 강남구 테스트로 1',
  startDate: '2026-08-20',
  endDate: '2026-08-22',
  announceDate: '2026-08-30',
  totalUnits: 120,
  competitionRate: null,
  competitionRates: [],
  status: 'closed',
  minPrice: null,
  maxPrice: null,
  houseType: '84㎡',
  supplyDates: [],
  supplyCategory: 'apt',
};

let root: Root | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('SubscriptionDetailModal', () => {
  it('모바일 하단 내비보다 높은 modal 계층을 선언한다', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root!.render(<SubscriptionDetailModal item={item} onClose={vi.fn()} />);
    });

    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    const backdrop = dialog.previousElementSibling as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.dataset.mobileNavObscures).toBe('true');
    expect(dialog.style.zIndex).toBe('111');
    expect(backdrop.style.zIndex).toBe('110');
  });
});
