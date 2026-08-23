// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useConsent } = vi.hoisted(() => ({ useConsent: vi.fn() }));
vi.mock('@/hooks/useConsent', () => ({ useConsent }));

import { VisitorAnalytics } from '../VisitorAnalytics';

const fetchMock = vi.fn();
let root: Root | null = null;

async function renderTracker() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<VisitorAnalytics />);
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useConsent.mockReset();
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 202 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('VisitorAnalytics', () => {
  it('분석 동의 전에는 방문 집계 요청을 보내지 않는다', async () => {
    useConsent.mockReturnValue({
      analytics: false,
      advertising: false,
      personalization: false,
      updatedAt: '2026-08-16T00:00:00.000Z',
      version: '2.2',
    });

    await renderTracker();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('분석 동의 후 동일 출처 fail-open POST를 한 번 보낸다', async () => {
    useConsent.mockReturnValue({
      analytics: true,
      advertising: false,
      personalization: false,
      updatedAt: '2026-08-16T00:00:00.000Z',
      version: '2.2',
    });

    await renderTracker();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/analytics/visit', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: true,
      headers: { 'x-naezip-analytics-consent': 'granted' },
    });
  });
});
