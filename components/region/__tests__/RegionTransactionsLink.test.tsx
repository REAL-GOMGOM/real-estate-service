// @vitest-environment jsdom

import { act, type MouseEventHandler, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trackAnalyticsEvent = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: ReactNode;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock('@/lib/cookie-consent', () => ({ trackAnalyticsEvent }));

import { RegionTransactionsLink } from '../RegionTransactionsLink';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  trackAnalyticsEvent.mockReset();
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
  host = null;
});

async function renderLink(placement: 'hero' | 'metrics') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <RegionTransactionsLink
        href="/transactions?district=test"
        ariaLabel="강남구 실거래 보기"
        regionId="gangnam-gu"
        placement={placement}
        className="test-link"
        style={{ color: 'blue' }}
      >
        실거래 보기
      </RegionTransactionsLink>,
    );
  });
  return host.querySelector<HTMLAnchorElement>('a');
}

describe('RegionTransactionsLink analytics', () => {
  it.each(['hero', 'metrics'] as const)(
    'records %s placement and region id through the consent-gated tracker',
    async (placement) => {
      const link = await renderLink(placement);
      expect(link).not.toBeNull();

      await act(async () => link!.click());

      expect(trackAnalyticsEvent).toHaveBeenCalledOnce();
      expect(trackAnalyticsEvent).toHaveBeenCalledWith('region_transaction_click', {
        placement,
        region_id: 'gangnam-gu',
      });
    },
  );
});
