import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/adsense-eligibility', () => {
  it('기본 설정은 대한민국 트래픽만 허용한다', async () => {
    vi.stubEnv('ADSENSE_ALLOWED_COUNTRIES', 'KR');
    const korea = await GET(new NextRequest('https://example.com/api/adsense-eligibility', {
      headers: { 'x-vercel-ip-country': 'KR' },
    }));
    const germany = await GET(new NextRequest('https://example.com/api/adsense-eligibility', {
      headers: { 'x-vercel-ip-country': 'DE' },
    }));

    await expect(korea.json()).resolves.toMatchObject({ eligible: true, country: 'KR' });
    await expect(germany.json()).resolves.toMatchObject({ eligible: false, country: 'DE' });
  });

  it('서버 허용 목록을 쉼표로 확장할 수 있다', async () => {
    vi.stubEnv('ADSENSE_ALLOWED_COUNTRIES', 'KR, JP');
    const response = await GET(new NextRequest('https://example.com/api/adsense-eligibility', {
      headers: { 'x-vercel-ip-country': 'JP' },
    }));
    await expect(response.json()).resolves.toMatchObject({ eligible: true, country: 'JP' });
  });
});
