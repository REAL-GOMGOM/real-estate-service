import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));
vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));
vi.mock('next/navigation', () => ({ unstable_rethrow: vi.fn() }));

import { GET } from '../route';

const fetchMock = vi.fn();

function naverResponse(items: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ items }),
  };
}

function articleResponse(image = 'https://cdn.example.com/news.jpg') {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    text: async () => `<html><meta property="og:image" content="${image}"></html>`,
  };
}

beforeEach(() => {
  vi.stubEnv('NAVER_CLIENT_ID', 'test-client');
  vi.stubEnv('NAVER_CLIENT_SECRET', 'test-secret');
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /api/news', () => {
  it('관련성이 없는 기사를 제외하고 URL·유사 제목 중복만 완화한다', async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://openapi.naver.com/')) {
        const query = new URL(url).searchParams.get('query') ?? '';
        if (query.includes('부동산')) {
          return naverResponse([
            {
              title: '<b>정부</b>, 서울 도심 주택 5만 가구 공급 계획 발표',
              originallink: 'https://www.yna.co.kr/view/A?utm_source=naver',
              link: 'https://n.news.naver.com/article/001/1',
              pubDate: 'Sun, 09 Aug 2026 12:00:00 +0900',
            },
            {
              title: '서울 도심 주택 5만 가구 공급 계획…정부 발표',
              originallink: 'https://news1.kr/articles/2',
              link: 'https://n.news.naver.com/article/421/2',
              pubDate: 'Sun, 09 Aug 2026 11:59:00 +0900',
            },
            {
              title: '서울 아파트 전세가격 3주 연속 상승',
              originallink: 'https://www.hankyung.com/realestate/3?utm_medium=search',
              link: 'https://n.news.naver.com/article/015/3',
              pubDate: 'Sun, 09 Aug 2026 11:00:00 +0900',
            },
            {
              title: '서울 아파트 매매가격 상승폭 확대',
              originallink: 'https://www.hankyung.com/realestate/4',
              link: 'https://n.news.naver.com/article/015/4',
              pubDate: 'Sun, 09 Aug 2026 10:30:00 +0900',
            },
            {
              title: '수도권 전세 시장 회복세…임대차 거래 증가',
              originallink: 'https://www.hankyung.com/realestate/3?utm_campaign=duplicate',
              link: 'https://n.news.naver.com/article/015/33',
              pubDate: 'Sun, 09 Aug 2026 10:20:00 +0900',
            },
            {
              title: '프로야구 오늘의 경기 결과',
              originallink: 'https://sports.example.com/5',
              link: 'https://n.news.naver.com/article/999/5',
              pubDate: 'Sun, 09 Aug 2026 10:00:00 +0900',
            },
            {
              title: '아파트 실거래 속보',
              originallink: 'http://127.0.0.1/admin',
              link: 'http://localhost/internal-news',
              pubDate: 'Sun, 09 Aug 2026 09:50:00 +0900',
            },
          ]);
        }

        if (query.includes('전세')) return naverResponse([]);

        return naverResponse([
          {
            title: '주담대 금리 4% 초반대로 하락',
            originallink: 'https://www.mk.co.kr/news/economy/6?from=naver',
            link: 'https://n.news.naver.com/article/009/6',
            pubDate: 'Sun, 09 Aug 2026 09:30:00 +0900',
          },
          {
            title: '코스피 오후 장중 상승세',
            originallink: 'https://finance.example.com/7',
            link: 'https://n.news.naver.com/article/998/7',
            pubDate: 'Sun, 09 Aug 2026 09:00:00 +0900',
          },
        ]);
      }

      return articleResponse();
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=900');
    expect(json.status).toBe('ok');
    expect(json.collection).toBe('automatic');
    expect(json.news).toHaveLength(4);
    expect(json.news.map((item: { title: string }) => item.title)).toEqual([
      '정부, 서울 도심 주택 5만 가구 공급 계획 발표',
      '서울 아파트 전세가격 3주 연속 상승',
      '서울 아파트 매매가격 상승폭 확대',
      '주담대 금리 4% 초반대로 하락',
    ]);
    expect(json.news[0]).toMatchObject({ source: '연합뉴스', thumbnail: 'https://cdn.example.com/news.jpg' });
    expect(json.news[1].source).toBe('한국경제');
    expect(json.news[3]).toMatchObject({ source: '매일경제', category: 'general' });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('127.0.0.1'))).toBe(false);
  });

  it('설정 누락을 503·unavailable로 명시하고 캐시하지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('NAVER_CLIENT_ID', '');
    vi.stubEnv('NAVER_CLIENT_SECRET', '');

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(json.status).toBe('unavailable');
    expect(json.news).toEqual([]);
    expect(json.error).toContain('다시 시도');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('제공처 HTTP 오류를 빈 정상 응답으로 위장하지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(json.status).toBe('unavailable');
    expect(json.news).toEqual([]);
    expect(json.error).toContain('제공처 연결');
  });
});
