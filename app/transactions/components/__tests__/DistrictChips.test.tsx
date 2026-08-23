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

  it('비어 있지 않은 통계는 API 순서와 수치를 그대로 렌더한다', async () => {
    const chips = await renderChips([
      { district: '서초구', count: 12, newHighs: 2 },
      { district: '강남구', count: 5, newHighs: 0 },
    ]);
    const tabs = Array.from(chips.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toBe('서초구122');
    expect(tabs[1].textContent).toBe('강남구5');
    expect(chips.textContent).not.toContain('송파구');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });
});
