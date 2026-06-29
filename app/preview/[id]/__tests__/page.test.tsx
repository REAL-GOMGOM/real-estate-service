import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';

/**
 * 공개 미리보기 라우트 통합 테스트.
 *
 * 핵심 보안 속성: 검증 실패 시 글을 조회조차 하지 않는다(내용 미노출).
 * preview-token 은 실제 모듈 사용(env stub), DB 조회/notFound 는 mock.
 *
 * 반환 React 엘리먼트 트리를 직접 순회해 검증(MDXRemote 는 호출되지 않음).
 */

const { getPostByIdForAdmin } = vi.hoisted(() => ({
  getPostByIdForAdmin: vi.fn(),
}));
vi.mock('@/lib/blog/queries', () => ({ getPostByIdForAdmin }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

// Cache Components(PPR) 대응으로 동적 본문은 PreviewContent 로 분리됨.
// 보안 게이트·DB 조회 로직이 PreviewContent 에 있으므로 테스트는 이를 직접 호출한다.
import { PreviewContent, metadata } from '../page';
import { createPreviewToken } from '@/lib/blog/preview-token';

const SECRET = 'preview-secret';
const POST_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

// 엘리먼트 트리에서 텍스트 노드 수집
function collectText(node: unknown, acc: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return acc;
  if (typeof node === 'string' || typeof node === 'number') {
    acc.push(String(node));
    return acc;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, acc));
    return acc;
  }
  const children = (node as { props?: { children?: unknown } })?.props?.children;
  if (children !== undefined) collectText(children, acc);
  return acc;
}

function renderPage(id: string, token: string | undefined) {
  return PreviewContent({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({ token }),
  });
}

beforeEach(() => {
  vi.stubEnv('PREVIEW_TOKEN_SECRET', SECRET);
  getPostByIdForAdmin.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('공개 미리보기 라우트', () => {
  it('noindex 메타 강제', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('유효 토큰 + 일치 id → draft 조회 후 제목 렌더', async () => {
    getPostByIdForAdmin.mockResolvedValue({
      id: POST_ID,
      title: '비공개 칼럼 제목',
      status: 'draft',
      mdxContent: '# 본문',
    });
    const token = createPreviewToken(POST_ID);

    const el = await renderPage(POST_ID, token);

    expect(getPostByIdForAdmin).toHaveBeenCalledWith(POST_ID);
    const text = collectText(el).join(' ');
    expect(text).toContain('비공개 칼럼 제목');
    expect(text).toContain('draft'); // status 배너
  });

  it('토큰 없음 → 글 조회 안 함(내용 미노출)', async () => {
    const el = await renderPage(POST_ID, undefined);
    expect(getPostByIdForAdmin).not.toHaveBeenCalled();
    expect(typeof (el as { type: unknown }).type).toBe('function'); // InvalidNotice
  });

  it('위조 토큰 → 글 조회 안 함', async () => {
    const el = await renderPage(POST_ID, 'forged.token');
    expect(getPostByIdForAdmin).not.toHaveBeenCalled();
    expect(typeof (el as { type: unknown }).type).toBe('function');
  });

  it('만료 토큰 → 글 조회 안 함', async () => {
    const token = createPreviewToken(POST_ID, -10);
    await renderPage(POST_ID, token);
    expect(getPostByIdForAdmin).not.toHaveBeenCalled();
  });

  it('id 불일치(다른 글 토큰) → 글 조회 안 함', async () => {
    const token = createPreviewToken(OTHER_ID);
    await renderPage(POST_ID, token);
    expect(getPostByIdForAdmin).not.toHaveBeenCalled();
  });

  it('유효 토큰이나 글 없음 → notFound()', async () => {
    getPostByIdForAdmin.mockResolvedValue(null);
    const token = createPreviewToken(POST_ID);
    await expect(renderPage(POST_ID, token)).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
