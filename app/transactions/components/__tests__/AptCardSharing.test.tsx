// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AptGroup, Transaction } from '../../types';

const buildImage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/share-image', () => ({
  buildShareImage: buildImage,
  shareOrDownloadImage: vi.fn(async () => {}),
}));
import AptCard from '../AptCard';

let root: Root | null = null;
let host: HTMLDivElement;

function transaction(values: Partial<Transaction>): Transaction {
  return {
    aptName: '잠실엘스', district: '송파구', area: 85, floor: 15,
    price: 341000, pricePerArea: 4012, date: '2026-08-01', ...values,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  buildImage.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function shareImage(transactions: Transaction[]) {
  const apt: AptGroup = { id: 'test', name: '잠실엘스', district: '송파구', areas: [60, 85], transactions };
  await act(async () => root!.render(<AptCard apt={apt} months={2} onClick={() => {}} />));
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-expanded]')!.click());
  const imageButton = [...host.querySelectorAll('button')].find((button) => button.textContent === '🖼 이미지로 공유');
  await act(async () => imageButton!.click());
  expect(buildImage).toHaveBeenCalledOnce();
  return buildImage.mock.lastCall![0];
}

describe('AptCard image price comparison', () => {
  it('uses the same latest area and prior peak for the shared card and sparkline', async () => {
    const image = await shareImage([
      transaction({ area: 60, price: 290000, date: '2026-07-01' }),
      transaction({ area: 60, price: 300500, date: '2026-07-02' }),
      transaction({ area: 60, price: 295000, date: '2026-07-03' }),
      transaction({ price: 335000, date: '2026-07-15' }),
      transaction({}),
    ]);
    expect(image).toMatchObject({
      price: '34.1억', high: true, delta: '▲ 6,000만',
      peakLine: '2개월 내 최고가 · 종전 33.5억 +6,000만',
      spark: [{ x: 0, y: 56 }, { x: 100, y: 0 }],
    });
  });

  it('does not infer an image price delta or new high from same-date contracts', async () => {
    const image = await shareImage([transaction({}), transaction({ price: 330000 })]);
    expect(image).toMatchObject({
      high: false, delta: '', spark: [], peakLine: '2개월 비교 거래 부족',
    });
  });

  it('omits the previous-contract delta when the preceding date has ambiguous prices', async () => {
    const image = await shareImage([
      transaction({}),
      transaction({ price: 331000, date: '2026-07-15' }),
      transaction({ price: 335000, date: '2026-07-15' }),
    ]);
    expect(image.delta).toBe('');
    expect(image.peakLine).toBe('2개월 내 최고가 · 종전 33.5억 +6,000만');
    expect(image.spark).toHaveLength(3);
  });
});
