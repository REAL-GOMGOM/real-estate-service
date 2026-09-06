// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AptGroup } from '@/lib/tx-shared';
import type { RentAptGroup, RentTransaction } from '@/lib/rent-shared';
import { PARTIAL_TRANSACTION_NOTICE, txKey } from '@/lib/tx-share-text';
import { rentTxKey } from '@/lib/rent-share-text';
import type { ShareCardData } from '@/lib/share-image';

const imageBuild = vi.hoisted(() => vi.fn<(data: ShareCardData) => Promise<Blob>>(async () => new Blob(['png'])));
const imageShare = vi.hoisted(() => vi.fn());
const priceChart = vi.hoisted(() => vi.fn<(props: { dataComplete?: boolean; transactions: unknown[] }) => null>(() => null));
vi.mock('@/lib/share-image', () => ({ buildShareImage: imageBuild, shareOrDownloadImage: imageShare }));
vi.mock('@/components/apt/PriceComboChart', () => ({ default: priceChart }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));

import AptCard from '../AptCard';
import AptDetailModal from '../AptDetailModal';
import RentAptCard from '../RentAptCard';
import RentAptDetailModal from '../RentAptDetailModal';

const apartment = {
  id: 'not-master-id', masterId: 'A12345', name: '우리집 2차 (A&B)+가든',
  district: '용인시 수지구', dong: '성복동 1가', areas: [84],
};
const apt: AptGroup = {
  ...apartment,
  transactions: [
    { aptName: apartment.name, district: apartment.district, date: '2026-08-03', area: 84, floor: 15, price: 155000, pricePerArea: 1845 },
    { aptName: apartment.name, district: apartment.district, date: '2026-07-01', area: 84, floor: 8, price: 151000, pricePerArea: 1798 },
  ],
};

function rentApartment(monthlyRent: number): RentAptGroup {
  const tx: RentTransaction = {
    aptName: apartment.name, district: apartment.district, dong: apartment.dong,
    date: '2026-08-03', area: 84, floor: 15, deposit: 50000, monthlyRent,
    buildYear: null, contractType: '갱신', prevDeposit: 40000, prevMonthlyRent: monthlyRent,
  };
  return { ...apartment, buildYear: null, transactions: [tx, { ...tx, date: '2026-07-01', floor: 8, deposit: 40000, contractType: '신규', prevDeposit: null }] };
}

let root: Root;
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
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(component: ReactNode) {
  await act(async () => root.render(component));
}

async function click(element: Element | null | undefined) {
  expect(element).toBeInstanceOf(HTMLElement);
  if (!(element instanceof HTMLElement)) throw new Error('Expected a clickable HTML element');
  await act(async () => element.click());
}

function button(label: string) {
  return [...host.querySelectorAll('button')].find((item) => item.textContent === label);
}

function expectPartialText(text: string) {
  expect(text).toContain(PARTIAL_TRANSACTION_NOTICE);
  expect(text).not.toMatch(/신고가|최고가|내 최고|고점|🔥/);
  expect(text).toContain(apartment.name);
  expect(text).toContain('84㎡');
}

function shareUrl() {
  const data = nativeShare.mock.lastCall![0] as ShareData;
  return new URL(data.url ?? data.text!.match(/^https?:\/\/\S+$/m)![0]);
}

function expectIdentity(url: URL, dealType: 'buy' | 'bunyang' | 'jeonse' | 'monthly', key: string) {
  expect(url.pathname).toBe('/transactions');
  expect(url.searchParams.get('q')).toBe(apartment.name);
  expect(url.searchParams.get('aptId')).toBe(apartment.masterId);
  expect(url.searchParams.get('aptDong')).toBe(apartment.dong);
  expect(url.searchParams.get('district')).toBe(apartment.district);
  expect(url.searchParams.get('months')).toBe('36');
  expect(url.searchParams.get('dealType')).toBe(dealType === 'buy' ? null : dealType);
  expect(url.searchParams.get(dealType === 'buy' || dealType === 'bunyang' ? 'tx' : 'rtx')).toBe(key);
}

describe('partial sale and presale data', () => {
  it.each(['buy', 'bunyang'] as const)('%s card keeps facts, qualifies available maximum and protects both share channels', async (dealType) => {
    await render(<AptCard apt={apt} onClick={vi.fn()} months={36} dealType={dealType} dataComplete={false} />);
    expect(host.textContent).toContain(PARTIAL_TRANSACTION_NOTICE);
    expect(host.textContent).toContain('확인된 거래 최고 15억 5,000만');
    expect(host.textContent).toContain('조회 36개월 확인 2건');
    expect(host.textContent).not.toMatch(/신고가|기간 최고가|종전 최고/);
    expect(host.querySelector('svg[aria-label]')?.getAttribute('aria-label')).toContain('확인된 거래 2건');

    await click(host.querySelector('button[aria-expanded]'));
    await click(button('🔗 링크 공유'));
    expectPartialText(nativeShare.mock.lastCall![0].text);
    expect(nativeShare.mock.lastCall![0].text).toContain('15.5억');
    const url = shareUrl();
    expectIdentity(url, dealType, txKey(apt.transactions[0]));

    await click(host.querySelector('button[aria-expanded]'));
    await click(button('🖼 이미지로 공유'));
    expect(imageBuild.mock.lastCall![0]).toMatchObject({ dataComplete: false, high: false, delta: '', price: '15.5억', peakLine: PARTIAL_TRANSACTION_NOTICE });
    expect(imageBuild.mock.lastCall![0].spark).toHaveLength(2);
    expect(imageShare.mock.lastCall![3]).toBe(url.toString());
  });

  it.each(['buy', 'bunyang'] as const)('%s detail limits peak claims across statistics, chart, rows and header/row sharing', async (dealType) => {
    await render(<AptDetailModal apt={apt} onClose={vi.fn()} months={36} dealType={dealType} dataComplete={false} />);
    expect(host.textContent).toContain('확인된 거래 평균');
    expect(host.textContent).toContain('확인된 거래 최고');
    expect(host.textContent).toContain('기간 비교 제한');
    expect(host.textContent).not.toMatch(/신고가|고점|최고가 대비|\d+(?:\.\d+)?%/);
    expect(priceChart.mock.lastCall![0].dataComplete).toBe(false);

    await click(host.querySelector('button[aria-label="공유하기"]'));
    expectPartialText(nativeShare.mock.lastCall![0].text);
    expectIdentity(shareUrl(), dealType, txKey(apt.transactions[0]));
    await click(host.querySelector('button[aria-label="이미지로 공유"]'));
    expect(imageBuild.mock.lastCall![0]).toMatchObject({ dataComplete: false, high: false, delta: '', price: '15.5억' });

    await click(host.querySelector('tbody tr'));
    expect(host.textContent).toContain('확인된 이전 유사 면적(±6㎡) 거래 대비');
    expect(host.textContent).not.toMatch(/신고가|고점|\d+(?:\.\d+)?%/);
    await click(button('🔗 텍스트 공유'));
    expectPartialText(nativeShare.mock.lastCall![0].text);
    await click(button('🖼 이미지 공유'));
    expect(imageBuild.mock.lastCall![0]).toMatchObject({ dataComplete: false, high: false, delta: '', price: '15.5억' });

    await click(host.querySelectorAll<HTMLTableRowElement>('tbody tr')[2]);
    await click(button('🔗 텍스트 공유'));
    expectPartialText(nativeShare.mock.lastCall![0].text);
    expect(nativeShare.mock.lastCall![0].text).toContain('15.1억');
    expectIdentity(shareUrl(), dealType, txKey(apt.transactions[1]));
  });

  it('also qualifies a partial clipboard fallback without changing its exact link', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: clipboardWrite } });
    await render(<AptCard apt={apt} onClick={vi.fn()} months={36} dataComplete={false} />);
    await click(host.querySelector('button[aria-expanded]'));
    await click(button('🔗 링크 공유'));
    const text = clipboardWrite.mock.lastCall![0] as string;
    expectPartialText(text);
    expectIdentity(new URL(text.match(/^https?:\/\/\S+$/m)![0]), 'buy', txKey(apt.transactions[0]));
    expect(nativeShare).not.toHaveBeenCalled();
  });

  it('restores complete-data comparisons after a successful retry and defaults to complete', async () => {
    await render(<AptCard apt={apt} onClick={vi.fn()} months={36} dataComplete={false} />);
    await render(<AptCard apt={apt} onClick={vi.fn()} months={36} />);
    expect(host.textContent).toContain('기간 신고가');
    expect(host.textContent).not.toContain(PARTIAL_TRANSACTION_NOTICE);
    await render(<AptDetailModal apt={apt} onClose={vi.fn()} months={36} dataComplete={false} />);
    await render(<AptDetailModal apt={apt} onClose={vi.fn()} months={36} dataComplete />);
    expect(host.textContent).toContain('3년 최고가 대비');
    expect(host.textContent).toContain('100%');
    expect(host.textContent).toContain('신고가');
    expect(host.textContent).not.toContain(PARTIAL_TRANSACTION_NOTICE);
    expect(priceChart.mock.lastCall![0].dataComplete).toBe(true);
  });
});

describe('partial jeonse and monthly rent data', () => {
  it.each([0, 120])('rent %s card qualifies available count and retains actual price/date', async (monthlyRent) => {
    const rentApt = rentApartment(monthlyRent);
    await render(<RentAptCard apt={rentApt} dataComplete={false} />);
    expect(host.textContent).toContain(PARTIAL_TRANSACTION_NOTICE);
    expect(host.textContent).toContain('확인 2건');
    expect(host.textContent).toContain(monthlyRent ? '5억/120만' : '5억');
    expect(host.textContent).toContain('26.08.03');
    await render(<RentAptCard apt={rentApt} />);
    expect(host.textContent).not.toContain(PARTIAL_TRANSACTION_NOTICE);
    expect(host.textContent).not.toContain('확인 2건');
  });

  it.each([0, 120])('rent %s detail qualifies available statistics and every share, preserving actual renewal facts', async (monthlyRent) => {
    const rentApt = rentApartment(monthlyRent);
    const dealType = monthlyRent ? 'monthly' : 'jeonse';
    await render(<RentAptDetailModal apt={rentApt} onClose={vi.fn()} months={36} dataComplete={false} />);
    expect(host.textContent).toContain(PARTIAL_TRANSACTION_NOTICE);
    expect(host.textContent).toContain('확인된 거래 평균 보증금');
    expect(host.textContent).toContain('확인된 거래 최고 보증금');
    expect(host.textContent).toContain('확인된 갱신 평균 인상률');
    expect(host.textContent).toContain('+25%');
    expect(priceChart.mock.lastCall![0].dataComplete).toBe(false);
    await click(button('↗ 공유하기'));
    expectPartialText(nativeShare.mock.lastCall![0].text);
    expectIdentity(shareUrl(), dealType, rentTxKey(rentApt.transactions[0]));
    await click(button('🖼 이미지로 공유'));
    expect(imageBuild.mock.lastCall![0]).toMatchObject({ dataComplete: false, high: false, delta: '', price: monthlyRent ? '5억/120만' : '5억' });

    await click(host.querySelector('tbody tr'));
    expect(host.textContent).toContain('확인된 이전 유사 면적(±6㎡) 거래 대비');
    expect(host.textContent).not.toMatch(/내 최고|신고가|고점/);
    await click(button('🔗 텍스트 공유'));
    expectPartialText(nativeShare.mock.lastCall![0].text);
    expectIdentity(shareUrl(), dealType, rentTxKey(rentApt.transactions[0]));
    await click(button('🖼 이미지 공유'));
    expect(imageBuild.mock.lastCall![0]).toMatchObject({ dataComplete: false, high: false, delta: '', peakLine: PARTIAL_TRANSACTION_NOTICE });
  });
});
