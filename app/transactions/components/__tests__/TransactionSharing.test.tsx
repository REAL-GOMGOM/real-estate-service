// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AptGroup } from '@/lib/tx-shared';
import type { RentAptGroup, RentTransaction } from '@/lib/rent-shared';
import { txKey } from '@/lib/tx-share-text';
import { rentTxKey } from '@/lib/rent-share-text';

const imageShare = vi.hoisted(() => vi.fn());
const imageBuild = vi.hoisted(() => vi.fn<(options: unknown) => Promise<Blob>>(async () => new Blob(['png'], { type: 'image/png' })));
const priceChart = vi.hoisted(() => vi.fn<(props: { transactions: unknown[]; maxPrice: number }) => null>(() => null));
vi.mock('@/lib/share-image', () => ({
  buildShareImage: imageBuild,
  shareOrDownloadImage: imageShare,
}));
vi.mock('@/components/apt/PriceComboChart', () => ({ default: priceChart }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import AptCard from '../AptCard';
import AptDetailModal from '../AptDetailModal';
import RentAptDetailModal from '../RentAptDetailModal';

const apartment = {
  id: 'not-a-master-id',
  masterId: 'A12345',
  name: '우리집 2차 (A&B)+가든',
  district: '용인시 수지구',
  dong: '성복동 1가',
  areas: [84],
};
const apt: AptGroup = {
  ...apartment,
  transactions: [
    { aptName: apartment.name, district: apartment.district, date: '2026-08-03', area: 84, floor: 15, price: 155000, pricePerArea: 1845 },
    { aptName: apartment.name, district: apartment.district, date: '2026-07-01', area: 84, floor: 8, price: 151000, pricePerArea: 1798 },
  ],
};

let root: Root | null = null;
let host: HTMLDivElement;
const nativeShare = vi.fn();
const clipboardWrite = vi.fn();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { share: nativeShare, clipboard: { writeText: clipboardWrite } });
  nativeShare.mockReset().mockResolvedValue(undefined);
  clipboardWrite.mockReset().mockResolvedValue(undefined);
  imageShare.mockReset().mockResolvedValue(undefined);
  imageBuild.mockClear();
  priceChart.mockClear();
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(component: ReactNode) {
  await act(async () => root!.render(component));
}

async function click(element: HTMLElement | null | undefined) {
  expect(element).toBeTruthy();
  await act(async () => element!.click());
}

function button(label: string) {
  return [...host.querySelectorAll('button')].find((item) => item.textContent === label);
}

function nativeUrl() {
  const data = nativeShare.mock.lastCall?.[0] as ShareData;
  const value = data.url ?? data.text?.match(/^https?:\/\/\S+$/m)?.[0];
  expect(value).toBeTruthy();
  return new URL(value!);
}

function expectApartment(url: URL, masterId: string | null = apartment.masterId) {
  expect(url.pathname).toBe('/transactions');
  expect(url.searchParams.get('q')).toBe(apartment.name);
  expect(url.searchParams.get('district')).toBe(apartment.district);
  expect(url.searchParams.get('aptDong')).toBe(apartment.dong);
  expect(url.searchParams.get('aptId')).toBe(masterId);
  expect(url.searchParams.get('months')).toBe('36');
}

describe('transaction share channels', () => {
  it.each(['buy', 'bunyang'] as const)('AptCard %s text and image shares use the same full identity URL', async (dealType) => {
    await render(<AptCard apt={apt} months={36} dealType={dealType} onClick={vi.fn()} />);
    await click(host.querySelector<HTMLButtonElement>('button[aria-expanded]'));
    await click(button('🔗 링크 공유'));
    const url = nativeUrl();
    expectApartment(url);
    expect(url.searchParams.get('tx')).toBe(txKey(apt.transactions[0]));
    expect(url.searchParams.get('dealType')).toBe(dealType === 'buy' ? null : dealType);

    await click(host.querySelector<HTMLButtonElement>('button[aria-expanded]'));
    await click(button('🖼 이미지로 공유'));
    expect(imageShare.mock.lastCall?.[3]).toBe(url.toString());
  });

  it('AptCard legacy clipboard sharing keeps name and dong without inventing a master ID', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: clipboardWrite } });
    await render(<AptCard apt={{ ...apt, masterId: null }} months={36} onClick={vi.fn()} />);
    await click(host.querySelector<HTMLButtonElement>('button[aria-expanded]'));
    await click(button('🔗 링크 공유'));
    const text = clipboardWrite.mock.lastCall?.[0] as string;
    const url = new URL(text.match(/^https?:\/\/\S+$/m)![0]);
    expectApartment(url, null);
    expect(url.searchParams.get('tx')).toBe(txKey(apt.transactions[0]));
    expect(nativeShare).not.toHaveBeenCalled();
  });

  it.each(['buy', 'bunyang'] as const)('AptDetailModal %s header and selected-contract shares preserve identity and tab', async (dealType) => {
    await render(<AptDetailModal apt={apt} months={36} dealType={dealType} onClose={vi.fn()} />);
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="공유하기"]'));
    const latestUrl = nativeUrl();
    expectApartment(latestUrl);
    expect(latestUrl.searchParams.get('dealType')).toBe(dealType === 'buy' ? null : dealType);
    expect(latestUrl.searchParams.get('tx')).toBe(txKey(apt.transactions[0]));
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="이미지로 공유"]'));
    expect(imageShare.mock.lastCall?.[3]).toBe(latestUrl.toString());

    await click(host.querySelectorAll<HTMLTableRowElement>('tbody tr')[1]);
    await click(button('🔗 텍스트 공유'));
    const olderUrl = nativeUrl();
    expectApartment(olderUrl);
    expect(olderUrl.searchParams.get('dealType')).toBe(dealType === 'buy' ? null : dealType);
    expect(olderUrl.searchParams.get('tx')).toBe(txKey(apt.transactions[1]));
    await click(button('🖼 이미지 공유'));
    expect(imageShare.mock.lastCall?.[3]).toBe(olderUrl.toString());
  });

  it.each([0, 120])('RentAptDetailModal rent=%s shares the same master identity and rent contract in text and image', async (monthlyRent) => {
    const tx: RentTransaction = {
      aptName: apartment.name, district: apartment.district, dong: apartment.dong,
      date: '2026-08-03', area: 84, floor: 15, deposit: 50000, monthlyRent,
      buildYear: null, contractType: '신규', prevDeposit: null, prevMonthlyRent: null,
    };
    const rentApt: RentAptGroup = {
      ...apartment, buildYear: null,
      transactions: [tx, { ...tx, date: '2026-07-01', floor: 8 }],
    };
    await render(<RentAptDetailModal apt={rentApt} months={36} onClose={vi.fn()} />);
    await click(button('↗ 공유하기'));
    const latestUrl = nativeUrl();
    expectApartment(latestUrl);
    expect(latestUrl.searchParams.get('dealType')).toBe(monthlyRent === 0 ? 'jeonse' : 'monthly');
    expect(latestUrl.searchParams.get('rtx')).toBe(rentTxKey(tx));
    expect(latestUrl.searchParams.has('tx')).toBe(false);
    await click(button('🖼 이미지로 공유'));
    expect(imageShare.mock.lastCall?.[3]).toBe(latestUrl.toString());

    await click(host.querySelectorAll<HTMLTableRowElement>('tbody tr')[1]);
    await click(button('🔗 텍스트 공유'));
    const olderUrl = nativeUrl();
    expectApartment(olderUrl);
    expect(olderUrl.searchParams.get('rtx')).toBe(rentTxKey(rentApt.transactions[1]));
    await click(button('🖼 이미지 공유'));
    expect(imageShare.mock.lastCall?.[3]).toBe(olderUrl.toString());
  });
});

describe('detail price comparison consistency', () => {
  it('uses the displayed 85㎡ cohort in chart, table and image even when 60㎡ is more common', async () => {
    const transactions = [
      { ...apt.transactions[0], date: '2026-09-05', area: 85, price: 341000 },
      { ...apt.transactions[0], date: '2026-08-28', area: 60, price: 300500 },
      { ...apt.transactions[0], date: '2026-08-27', area: 60, price: 299000 },
      { ...apt.transactions[0], date: '2026-08-26', area: 60, price: 298000 },
      { ...apt.transactions[0], date: '2026-08-25', area: 85, price: 335000 },
    ];
    await render(<AptDetailModal apt={{ ...apt, transactions }} months={2} onClose={vi.fn()} />);
    const chart = priceChart.mock.lastCall?.[0] as unknown as { transactions: typeof transactions; maxPrice: number };
    expect(chart.transactions.map((tx) => tx.area)).toEqual([85, 85]);
    expect(chart.maxPrice).toBe(341000);
    expect(host.textContent).toContain('85㎡ 유사 면적(±6㎡) 가격 흐름 · 조회 2개월');
    expect(host.textContent).not.toContain('전고점 경신');
    const rows = host.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('100.0%');
    expect(rows[4].textContent).not.toContain('신고가');
    expect(rows[4].textContent).not.toContain('98.2%');
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="이미지로 공유"]'));
    expect(imageBuild.mock.lastCall?.[0]).toMatchObject({
      price: '34.1억', delta: '▲ 6,000만', high: true,
      peakLine: '2개월 내 최고가 · 종전 33.5억 +6,000만',
    });
  });

  it('a single contract has no high badge, percentage or flame in shared text', async () => {
    await render(<AptDetailModal apt={{ ...apt, transactions: [apt.transactions[0]] }} months={2} onClose={vi.fn()} />);
    expect(host.textContent).toContain('비교 거래 부족');
    expect(host.textContent).not.toContain('신고가');
    expect(host.textContent).not.toContain('100.0%');
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="공유하기"]'));
    expect(nativeShare.mock.lastCall?.[0].text).toContain('ℹ️ 2개월 비교 거래 부족');
    expect(nativeShare.mock.lastCall?.[0].text).not.toContain('🔥');
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="이미지로 공유"]'));
    expect(imageBuild.mock.lastCall?.[0]).toMatchObject({ high: false, delta: '', peakLine: '2개월 비교 거래 부족' });
  });

  it('sharing an older contract does not compare it against a future contract', async () => {
    await render(<AptDetailModal apt={apt} months={2} onClose={vi.fn()} />);
    await click(host.querySelectorAll<HTMLTableRowElement>('tbody tr')[1]);
    await click(button('🔗 텍스트 공유'));
    expect(nativeShare.mock.lastCall?.[0].text).toContain('ℹ️ 2개월 비교 거래 부족');
    expect(nativeShare.mock.lastCall?.[0].text).not.toContain('낮음');
    await click(button('🖼 이미지 공유'));
    expect(imageBuild.mock.lastCall?.[0]).toMatchObject({ high: false, delta: '', peakLine: '2개월 비교 거래 부족' });
  });
});
