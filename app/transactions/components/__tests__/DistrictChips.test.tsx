// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DistrictStat } from '../../types';
import DistrictChips from '../DistrictChips';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderChips(stats?: DistrictStat[] | null) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);

  await act(async () => {
    root!.render(
      <DistrictChips
        districts={['강남구', '서초구', '송파구']}
        stats={stats}
        active="강남구"
        onPick={() => undefined}
      />,
    );
  });

  return host;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('DistrictChips', () => {
  const fallbackCases: Array<[string, DistrictStat[] | null | undefined]> = [
    ['undefined', undefined],
    ['null', null],
    ['empty', []],
  ];

  it.each(fallbackCases)('%s stats이면 정적 지역 목록으로 폴백한다', async (_label, stats) => {
    const chips = await renderChips(stats);
    const tabs = Array.from(chips.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      '강남구·',
      '서초구·',
      '송파구·',
    ]);
  });

  it('통계의 API 순서와 수치를 유지하고 누락 지역은 미확인 건수로 보완한다', async () => {
    const chips = await renderChips([
      { district: '서초구', count: 12, newHighs: 2 },
      { district: '강남구', count: 5, newHighs: 0 },
    ]);
    const tabs = Array.from(chips.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

    expect(tabs).toHaveLength(3);
    expect(tabs[0].textContent).toBe('서초구122');
    expect(tabs[1].textContent).toBe('강남구5');
    expect(tabs[2].textContent).toBe('송파구·');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('다른 권역이나 중복 통계로 지원 지역 칩을 대체하지 않는다', async () => {
    const chips = await renderChips([
      { district: '춘천시', count: 900, newHighs: 9 },
      { district: '서초구', count: 12, newHighs: 2 },
      { district: '서초구', count: 40, newHighs: 3 },
    ]);
    const tabs = Array.from(chips.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.textContent)).toEqual(['서초구122', '강남구·', '송파구·']);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });
});
