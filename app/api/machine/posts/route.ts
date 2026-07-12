import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getBlogDb } from '@/lib/db/client';
import { posts, categories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyMachineToken } from '@/lib/api/machine-auth';
import { validateMdxStrict } from '@/lib/blog/validate-mdx';
import { normalizeSlug, slugifyBase, ensureUniqueSlug } from '@/lib/blog/slug';
import { createPreviewToken } from '@/lib/blog/preview-token';
import { SITE_URL } from '@/lib/site';

/**
 * 머신(텔레그램 봇) 발행 API — 글 생성.
 *
 * POST /api/machine/posts
 *   인증: Authorization: Bearer <MACHINE_PUBLISH_SECRET>
 *   body: { title, mdxContent, excerpt?, categoryId?, categorySlug?, coverImageUrl? }
 *   - categorySlug: 'market-trends'|'subscription'|'loan'|'tax'|'policy' — 서버에서 id 변환 (봇용)
 *   → MDX 검증 통과 시 status:'draft' 로 insert. 발행은 PATCH 로 별도.
 *
 * 응답: { id, slug, previewUrl }
 */

const TITLE_MAX = 200;
const EXCERPT_MAX = 300;
const CONTENT_MAX = 100_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CreateBody = {
  title: string;
  mdxContent: string;
  excerpt: string | null;
  categoryId: string | null;
  /** 카테고리 slug — categoryId 대신 사용 가능 (봇은 UUID 를 모름). 2026-07-12 */
  categorySlug: string | null;
  coverImageUrl: string | null;
  // 클라이언트(봇)가 제안하는 slug. 정규화 후 base 로 사용, 비면 title 폴백.
  slug: string | null;
};

const CATEGORY_SLUG_PATTERN = /^[a-z0-9-]{1,50}$/;

function parseBody(raw: unknown): CreateBody | { error: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { error: 'JSON 객체 body가 필요합니다' };
  }
  const b = raw as Record<string, unknown>;

  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const mdxContent = typeof b.mdxContent === 'string' ? b.mdxContent : '';
  const excerpt = typeof b.excerpt === 'string' ? b.excerpt.trim() : '';
  const categoryId = typeof b.categoryId === 'string' ? b.categoryId.trim() : '';
  const categorySlug = typeof b.categorySlug === 'string' ? b.categorySlug.trim() : '';
  const coverImageUrl =
    typeof b.coverImageUrl === 'string' ? b.coverImageUrl.trim() : '';
  const slug = typeof b.slug === 'string' ? b.slug.trim() : '';

  if (title.length === 0 || title.length > TITLE_MAX) {
    return { error: `title은 1~${TITLE_MAX}자여야 합니다` };
  }
  if (mdxContent.length === 0 || mdxContent.length > CONTENT_MAX) {
    return { error: `mdxContent는 1~${CONTENT_MAX}자여야 합니다` };
  }
  if (excerpt.length > EXCERPT_MAX) {
    return { error: `excerpt는 ${EXCERPT_MAX}자 이내여야 합니다` };
  }
  if (categoryId && !UUID_PATTERN.test(categoryId)) {
    return { error: 'categoryId 형식이 올바르지 않습니다' };
  }
  if (categorySlug && !CATEGORY_SLUG_PATTERN.test(categorySlug)) {
    return { error: 'categorySlug 형식이 올바르지 않습니다' };
  }

  return {
    title,
    mdxContent,
    excerpt: excerpt.length > 0 ? excerpt : null,
    categoryId: categoryId.length > 0 ? categoryId : null,
    categorySlug: categorySlug.length > 0 ? categorySlug : null,
    coverImageUrl: coverImageUrl.length > 0 ? coverImageUrl : null,
    slug: slug.length > 0 ? slug : null,
  };
}

export async function POST(req: NextRequest) {
  // 1) 인증
  const auth = verifyMachineToken(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 2) body 파싱
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 JSON body' }, { status: 400 });
  }
  const parsed = parseBody(raw);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // 3) MDX 검증 게이트 (실패 시 422) — strict: 문법 + 미등록 컴포넌트 참조까지 차단
  const mdx = await validateMdxStrict(parsed.mdxContent);
  if (!mdx.ok) {
    return NextResponse.json(
      { error: 'MDX 컴파일 실패', detail: mdx.error },
      { status: 422 },
    );
  }

  // 4) slug 생성 + 충돌 처리 → draft insert
  try {
    // base 결정: 클라이언트 slug 정규화 결과 우선, 비면(한글/특수문자 등) 제목 폴백.
    // 클라이언트 slug 도 신뢰 불가 입력 → normalizeSlug 로 안전화 후 사용.
    const base = normalizeSlug(parsed.slug ?? '') || slugifyBase(parsed.title);
    const slug = await ensureUniqueSlug(base);

    // categorySlug → id 변환 (미존재 slug 는 fail-open: 카테고리 없이 발행 진행)
    let categoryId = parsed.categoryId;
    let categoryName: string | null = null;
    if (!categoryId && parsed.categorySlug) {
      const cat = await getBlogDb()
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.slug, parsed.categorySlug))
        .limit(1);
      if (cat.length > 0) {
        categoryId = cat[0].id;
        categoryName = cat[0].name;
      }
    }

    const result = await getBlogDb()
      .insert(posts)
      .values({
        slug,
        title: parsed.title,
        excerpt: parsed.excerpt,
        mdxContent: parsed.mdxContent,
        coverImageUrl: parsed.coverImageUrl,
        categoryId,
        status: 'draft',
        publishedAt: null,
      })
      .returning({ id: posts.id, slug: posts.slug });

    const row = result[0];
    if (!row) {
      return NextResponse.json({ error: '저장 실패' }, { status: 500 });
    }

    revalidatePath('/admin/posts');

    // 서명 토큰이 붙은 공개 미리보기 절대 URL — 봇이 폰 브라우저에서 로그인 없이 열람.
    // 절대 URL 베이스는 SITE_URL(NEXT_PUBLIC_SITE_URL) 단일 출처 사용.
    const token = createPreviewToken(row.id);
    const previewUrl = `${SITE_URL}/preview/${row.id}?token=${token}`;

    return NextResponse.json(
      // category: 봇이 초안 카드에 "📂 카테고리" 표시용 (미매핑이면 null)
      { id: row.id, slug: row.slug, previewUrl, category: categoryName },
      { status: 201 },
    );
  } catch (e) {
    console.error('[machine.posts.POST] 에러:', e);
    return NextResponse.json(
      { error: 'slug 중복 또는 저장 오류' },
      { status: 500 },
    );
  }
}
