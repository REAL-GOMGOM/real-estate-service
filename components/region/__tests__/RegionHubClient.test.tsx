// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_LOCATION_SCORES } from '@/lib/location-score-data';

const routeQuery = vi.hoisted(() => ({ value: '' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(routeQuery.value),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { RegionHubClient } from '../RegionHubClient';

const initialData = PUBLIC_LOCATION_SCORES.filter(({ id }) =>
  ['gangnam-gu', 'seocho-gu'].includes(id),
);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderHub(query: string) {
  routeQuery.value = query;
  if (!host) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  }

  await act(async () => {
    root!.render(<RegionHubClient initialData={initialData} />);
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
  routeQuery.value = '';
  document.body.innerHTML = '';
});

describe('RegionHubClient query state', () => {
  it('keeps the initial URL query visible and applies it to the region list', async () => {
    const page = await renderHub('q=강남');
    const input = page.querySelector<HTMLInputElement>('input[aria-label="지역 검색"]');

    expect(input?.value).toBe('강남');
    expect(page.textContent).toContain('강남구');
    expect(page.textContent).not.toContain('서초구');
    expect(page.textContent).toContain('총 1개 지역');
  });

  it('resets the controlled search when client navigation changes q', async () => {
    let page = await renderHub('q=강남');
    expect(page.querySelector<HTMLInputElement>('input[aria-label="지역 검색"]')?.value)
      .toBe('강남');

    page = await renderHub('q=서초');

    expect(page.querySelector<HTMLInputElement>('input[aria-label="지역 검색"]')?.value)
      .toBe('서초');
    expect(page.textContent).toContain('서초구');
    expect(page.textContent).not.toContain('강남구');
  });
});
