'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { auth } from '@/auth';
import { getBlogDb } from '@/lib/db/client';
import { posts } from '@/lib/db/schema';

/**
 * 글(posts) Server Actions.
 *
 * 권한: 모든 액션 시작에 requireAdmin.
 *
 * 시그니처:
 * - createPost/updatePost: useActionState 호환 (_prev, formData)
 * - publish/unpublish/delete: bind 패턴 (form action={fn.bind(null, id)})
 *
 * 발행 정책:
 * - draft → published: published_at = COALESCE(현재값, now()) — 최초 발행 시각 보존
 * - published → draft: published_at 유지 (재발행 시 원래 시각 회복)
 */

const SLUG_PATTERN = /^[a-z0-9-]{1,200}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_MAX = 200;
const EXCERPT_MAX = 300;
const CONTENT_MAX = 100_000;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    redirect('/admin/login');
  }
}

export type ActionState = null | { ok: true; postId?: string } | { error: string };

type PostInput = {
  slug: string;
  title: string;
  excerpt: string | null;
  mdxContent: string;
  coverImageUrl: string | null;
  categoryId: string | null;
};

function parseFormData(formData: FormData): PostInput | { error: string } {
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const title = String(formData.get('title') ?? '').trim();
  const excerptRaw = String(formData.get('excerpt') ?? '').trim();
  const mdxContent = String(formData.get('mdxContent') ?? '');
  const coverImageRaw = String(formData.get('coverImageUrl') ?? '').trim();
  const categoryRaw = String(formData.get('categoryId') ?? '').trim();

  if (!SLUG_PATTERN.test(slug)) {
    return { error: 'slug는 영문 소문자·숫자·하이픈 1~200자만 허용됩니다' };
  }
  if (title.length === 0 || title.length > TITLE_MAX) {
    return { error: `제목은 1~${TITLE_MAX}자로 입력해주세요` };
  }
  if (excerptRaw.length > EXCERPT_MAX) {
    return { error: `요약은 ${EXCERPT_MAX}자 이내` };
  }
  if (mdxContent.length === 0 || mdxContent.length > CONTENT_MAX) {
    return { error: `본문은 1~${CONTENT_MAX}자로 입력해주세요` };
  }
  if (categoryRaw && !UUID_PATTERN.test(categoryRaw)) {
    return { error: '카테고리 형식이 올바르지 않습니다' };
  }

  return {
    slug,
    title,
    excerpt: excerptRaw.length > 0 ? excerptRaw : null,
    mdxContent,
    coverImageUrl: coverImageRaw.length > 0 ? coverImageRaw : null,
    categoryId: categoryRaw.length > 0 ? categoryRaw : null,
  };
}

/* ============================================================
 * createPost
 * ============================================================ */
export async function createPost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = parseFormData(formData);
  if ('error' in parsed) return parsed;

  // intent: 'save' (status=draft) | 'publish' (status=published, publishedAt=now)
  const intent = String(formData.get('intent') ?? 'save');
  const isPublish = intent === 'publish';

  let postId: string | undefined;
  try {
    const result = await getBlogDb()
      .insert(posts)
      .values({
        slug: parsed.slug,
        title: parsed.title,
        excerpt: parsed.excerpt,
        mdxContent: parsed.mdxContent,
        coverImageUrl: parsed.coverImageUrl,
        categoryId: parsed.categoryId,
        status: isPublish ? 'published' : 'draft',
        publishedAt: isPublish ? new Date() : null,
      })
      .returning({ id: posts.id });

    postId = result[0]?.id;
    if (!postId) {
      return { error: '저장 실패: 식별자 누락' };
    }
  } catch (e) {
    console.error('[posts.create] 에러:', e);
    return { error: '이미 존재하는 slug이거나 저장 중 오류가 발생했습니다' };
  }

  revalidatePath('/admin/posts');
  revalidatePath('/blog');
  // 작성 후 수정 페이지로 redirect — 폼 유실 방지 + 발행 토글 가능
  redirect(`/admin/posts/${postId}/edit`);
}

/* ============================================================
 * updatePost
 * ============================================================ */
export async function updatePost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const id = String(formData.get('id') ?? '').trim();
  if (!UUID_PATTERN.test(id)) {
    return { error: '잘못된 글 식별자입니다' };
  }

  const parsed = parseFormData(formData);
  if ('error' in parsed) return parsed;

  const intent = String(formData.get('intent') ?? 'save');
  const isPublish = intent === 'publish';

  const updateValues: Partial<typeof posts.$inferInsert> = {
    slug: parsed.slug,
    title: parsed.title,
    excerpt: parsed.excerpt,
    mdxContent: parsed.mdxContent,
    coverImageUrl: parsed.coverImageUrl,
    categoryId: parsed.categoryId,
    // updatedAt은 schema의 $onUpdate가 자동 처리
  };

  let result;
  try {
    if (isPublish) {
      result = await getBlogDb()
        .update(posts)
        .set({
          ...updateValues,
          status: 'published',
          // 최초 발행 시각 보존
          publishedAt: sql`COALESCE(${posts.publishedAt}, now())`,
        })
        .where(eq(posts.id, id))
        .returning({ id: posts.id });
    } else {
      result = await getBlogDb()
        .update(posts)
        .set(updateValues)
        .where(eq(posts.id, id))
        .returning({ id: posts.id });
    }

    if (result.length === 0) {
      return { error: '글을 찾을 수 없습니다' };
    }
  } catch (e) {
    console.error('[posts.update] 에러:', e);
    return { error: 'slug 중복 또는 저장 오류' };
  }

  revalidatePath('/admin/posts');
  revalidatePath(`/admin/posts/${id}/edit`);
  revalidatePath('/blog');
  return { ok: true, postId: id };
}

/* ============================================================
 * publishPostAction (form action bind)
 * ============================================================ */
export async function publishPostAction(id: string, _formData: FormData) {
  await requireAdmin();
  if (!UUID_PATTERN.test(id)) return;

  await getBlogDb()
    .update(posts)
    .set({
      status: 'published',
      // 최초 발행 시각 보존: 이미 값 있으면 유지, 없으면 now()
      publishedAt: sql`COALESCE(${posts.publishedAt}, now())`,
    })
    .where(eq(posts.id, id));

  revalidatePath('/admin/posts');
  revalidatePath(`/admin/posts/${id}/edit`);
  revalidatePath('/blog');
}

/* ============================================================
 * unpublishPostAction (form action bind)
 * ============================================================ */
export async function unpublishPostAction(id: string, _formData: FormData) {
  await requireAdmin();
  if (!UUID_PATTERN.test(id)) return;

  await getBlogDb()
    .update(posts)
    .set({ status: 'draft' })
    .where(eq(posts.id, id));

  revalidatePath('/admin/posts');
  revalidatePath(`/admin/posts/${id}/edit`);
  revalidatePath('/blog');
}

/* ============================================================
 * deletePostAction (form action bind)
 * ============================================================ */
export async function deletePostAction(id: string, _formData: FormData) {
  await requireAdmin();
  if (!UUID_PATTERN.test(id)) return;

  await getBlogDb().delete(posts).where(eq(posts.id, id));

  revalidatePath('/admin/posts');
  revalidatePath('/blog');
  redirect('/admin/posts');
}
