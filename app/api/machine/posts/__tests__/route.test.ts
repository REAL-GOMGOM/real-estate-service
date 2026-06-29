import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';

/**
 * 머신 발행 API 라우트 통합 테스트.
 *
 * DB(@/lib/db/client)와 next/cache 만 mock. 인증·MDX검증·slug·publish 는 실제 모듈 사용.
 */

// --- DB mock (체인형) ---
const insertReturningMock = vi.fn();
const updateReturningMock = vi.fn();
const selectWhereThenMock = vi.fn(() => [] as Array<{ slug: string }>); // slug 충돌조회
const selectLimitMock = vi.fn(); // DELETE status 조회
const deleteWhereMock = vi.fn(() => Promise.resolve(undefined));

const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }));
const fakeDb = {
  insert: () => ({ values: insertValuesMock }),
  update: () => ({
    set: () => ({ where: () => ({ returning: updateReturningMock }) }),
  }),
  select: () => ({
    from: () => ({
      where: () => ({
        limit: selectLimitMock,
        // slug.ts 는 where() 결과를 바로 await → thenable 로 동작
        then: (resolve: (v: unknown) => void) => resolve(selectWhereThenMock()),
      }),
    }),
  }),
  delete: () => ({ where: deleteWhereMock }),
};

vi.mock('@/lib/db/client', () => ({ getBlogDb: () => fakeDb }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { POST } from '../route';
import { PATCH, DELETE } from '../[id]/route';
import { verifyPreviewToken } from '@/lib/blog/preview-token';
import { SITE_URL } from '@/lib/site';

const SECRET = 'test-machine-secret';
const PREVIEW_SECRET = 'test-preview-secret';
const UUID = '11111111-1111-1111-1111-111111111111';

function postReq(body: unknown, token: string | null = SECRET): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token !== null) headers.set('authorization', `Bearer ${token}`);
  return new Request('https://example.com/api/machine/posts', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function idReq(method: string, token: string | null = SECRET): Request {
  const headers = new Headers();
  if (token !== null) headers.set('authorization', `Bearer ${token}`);
  return new Request(`https://example.com/api/machine/posts/${UUID}`, {
    method,
    headers,
  });
}

const ctx = { params: Promise.resolve({ id: UUID }) };

// insert().values(...) 에 전달된 slug 캡처 (충돌 없을 때 base == 최종 slug)
function insertedSlug(): string {
  const values = (insertValuesMock.mock.calls[0] as unknown[])[0] as {
    slug: string;
  };
  return values.slug;
}

beforeEach(() => {
  vi.stubEnv('MACHINE_PUBLISH_SECRET', SECRET);
  vi.stubEnv('PREVIEW_TOKEN_SECRET', PREVIEW_SECRET);
  insertReturningMock.mockReset();
  insertValuesMock.mockClear();
  updateReturningMock.mockReset();
  selectWhereThenMock.mockReset();
  selectWhereThenMock.mockReturnValue([]);
  selectLimitMock.mockReset();
  deleteWhereMock.mockReset();
  deleteWhereMock.mockReturnValue(Promise.resolve(undefined));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* ============================== POST ============================== */
describe('POST /api/machine/posts', () => {
  it('정상 — draft 생성 + 201 + 토큰 붙은 절대 previewUrl', async () => {
    insertReturningMock.mockResolvedValue([{ id: UUID, slug: 'hello-world' }]);

    const res = await POST(
      postReq({ title: 'Hello World', mdxContent: '# 제목\n\n본문' }) as never,
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe(UUID);
    expect(json.slug).toBe('hello-world');

    // previewUrl 은 SITE_URL 기반 절대 URL + ?token=
    const prefix = `${SITE_URL}/preview/${UUID}?token=`;
    expect(json.previewUrl.startsWith(prefix)).toBe(true);

    // 붙은 토큰이 실제로 verify 통과하고 해당 postId 에 바인딩돼 있는지
    const token = json.previewUrl.slice(prefix.length);
    expect(verifyPreviewToken(token)).toEqual({ ok: true, postId: UUID });
  });

  it('인증 실패(토큰 없음) → 401', async () => {
    const res = await POST(
      postReq({ title: 'X', mdxContent: 'y' }, null) as never,
    );
    expect(res.status).toBe(401);
  });

  it('인증 실패(토큰 불일치) → 401', async () => {
    const res = await POST(
      postReq({ title: 'X', mdxContent: 'y' }, 'wrong') as never,
    );
    expect(res.status).toBe(401);
  });

  it('깨진 MDX → 422 + detail', async () => {
    const res = await POST(
      postReq({ title: 'Bad', mdxContent: '본문\n\n<div>안 닫음' }) as never,
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe('MDX 컴파일 실패');
    expect(typeof json.detail).toBe('string');
  });

  it('title 누락 → 400', async () => {
    const res = await POST(postReq({ mdxContent: 'y' }) as never);
    expect(res.status).toBe(400);
  });

  it('slug 충돌 시 suffix 부여되어 insert', async () => {
    selectWhereThenMock.mockReturnValue([{ slug: 'hello-world' }]); // base 충돌
    insertReturningMock.mockResolvedValue([{ id: UUID, slug: 'hello-world-2' }]);

    const res = await POST(
      postReq({ title: 'Hello World', mdxContent: '본문' }) as never,
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.slug).toBe('hello-world-2');
  });

  // === 이슈 #1: 클라이언트 slug 를 base 로 사용 ===
  // insert 에 실제로 전달된 slug 를 캡처해 검증 (충돌 없을 때 base == 최종 slug)

  it('영문 slug 제공 시 → 그 slug 가 base (제목 무시)', async () => {
    insertReturningMock.mockResolvedValue([{ id: UUID, slug: 'x' }]);
    await POST(
      postReq({
        title: '한글 제목입니다', // 무시되어야 함
        mdxContent: '본문',
        slug: 'gangnam-reconstruction-2026',
      }) as never,
    );
    expect(insertedSlug()).toBe(
      'gangnam-reconstruction-2026',
    );
  });

  it('slug 미제공 시 → 제목 기반 폴백', async () => {
    insertReturningMock.mockResolvedValue([{ id: UUID, slug: 'x' }]);
    await POST(
      postReq({ title: 'Fallback Title', mdxContent: '본문' }) as never,
    );
    expect(insertedSlug()).toBe('fallback-title');
  });

  it('빈/공백 slug 시 → 제목 기반 폴백', async () => {
    insertReturningMock.mockResolvedValue([{ id: UUID, slug: 'x' }]);
    await POST(
      postReq({
        title: 'Fallback Title',
        mdxContent: '본문',
        slug: '   ',
      }) as never,
    );
    expect(insertedSlug()).toBe('fallback-title');
  });

  it('비정상 문자 섞인 slug → 정규화되어 안전한 slug', async () => {
    insertReturningMock.mockResolvedValue([{ id: UUID, slug: 'x' }]);
    await POST(
      postReq({
        title: '한글 제목',
        mdxContent: '본문',
        slug: 'Hello World!@#',
      }) as never,
    );
    expect(insertedSlug()).toBe('hello-world');
  });

  it('정규화 후 빈 문자열 되는 slug(한글/특수문자) → 제목 폴백', async () => {
    insertReturningMock.mockResolvedValue([{ id: UUID, slug: 'x' }]);
    await POST(
      postReq({
        title: 'Real Title',
        mdxContent: '본문',
        slug: '!@#$%', // 정규화하면 ''
      }) as never,
    );
    expect(insertedSlug()).toBe('real-title');
  });

  it('제공된 slug 가 기존과 충돌 시 → suffix 부여', async () => {
    selectWhereThenMock.mockReturnValue([{ slug: 'my-slug' }]); // base 충돌
    insertReturningMock.mockResolvedValue([{ id: UUID, slug: 'x' }]);
    await POST(
      postReq({
        title: '한글 제목',
        mdxContent: '본문',
        slug: 'my-slug',
      }) as never,
    );
    expect(insertedSlug()).toBe('my-slug-2');
  });
});

/* ============================== PATCH ============================== */
describe('PATCH /api/machine/posts/[id]', () => {
  it('정상 — published 전환 + {id, slug, publishedUrl}', async () => {
    updateReturningMock.mockResolvedValue([{ id: UUID, slug: 'hello' }]);

    const res = await PATCH(idReq('PATCH') as never, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      id: UUID,
      slug: 'hello',
      publishedUrl: '/blog/hello',
    });
  });

  it('멱등 — 이미 published 여도 동일 응답(행 반환)', async () => {
    updateReturningMock.mockResolvedValue([{ id: UUID, slug: 'hello' }]);
    const res = await PATCH(idReq('PATCH') as never, ctx);
    expect(res.status).toBe(200);
  });

  it('대상 없음 → 404', async () => {
    updateReturningMock.mockResolvedValue([]);
    const res = await PATCH(idReq('PATCH') as never, ctx);
    expect(res.status).toBe(404);
  });

  it('인증 실패 → 401', async () => {
    const res = await PATCH(idReq('PATCH', null) as never, ctx);
    expect(res.status).toBe(401);
  });
});

/* ============================== DELETE ============================== */
describe('DELETE /api/machine/posts/[id]', () => {
  it('draft 삭제 → 200 {deleted:true}', async () => {
    selectLimitMock.mockResolvedValue([{ status: 'draft' }]);

    const res = await DELETE(idReq('DELETE') as never, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ id: UUID, deleted: true });
    expect(deleteWhereMock).toHaveBeenCalled();
  });

  it('published 삭제 거부 → 409, delete 미호출', async () => {
    selectLimitMock.mockResolvedValue([{ status: 'published' }]);

    const res = await DELETE(idReq('DELETE') as never, ctx);
    expect(res.status).toBe(409);
    expect(deleteWhereMock).not.toHaveBeenCalled();
  });

  it('대상 없음 → 404', async () => {
    selectLimitMock.mockResolvedValue([]);
    const res = await DELETE(idReq('DELETE') as never, ctx);
    expect(res.status).toBe(404);
  });

  it('인증 실패 → 401', async () => {
    const res = await DELETE(idReq('DELETE', null) as never, ctx);
    expect(res.status).toBe(401);
  });
});
