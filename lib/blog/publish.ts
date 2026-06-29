import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { posts } from '@/lib/db/schema';

/**
 * 글 발행 상태 전환 공유 로직.
 *
 * 인증/세션/캐시(revalidatePath)에 의존하지 않는 순수 DB 작업.
 * → Server Action(어드민)과 머신 발행 API가 동일하게 재사용한다.
 *
 * 발행 정책(기존 동작 보존):
 * - draft → published: published_at = COALESCE(현재값, now()) — 최초 발행 시각 보존
 * - 재발행(이미 published)이어도 멱등: 기존 published_at 유지
 * - published → draft: published_at 은 건드리지 않음 (재발행 시 원래 시각 회복)
 */

/**
 * 발행 시 set 할 컬럼 값.
 *
 * updatePost 처럼 본문 수정과 발행을 한 쿼리로 합칠 때
 * `{ ...updateValues, ...publishSetValues() }` 로 펼쳐 쓰기 위해 분리.
 *
 * 호출마다 새 객체를 반환해 공유 가변상태를 만들지 않는다.
 */
export function publishSetValues() {
  return {
    status: 'published' as const,
    // 최초 발행 시각 보존: 이미 값 있으면 유지, 없으면 now()
    publishedAt: sql`COALESCE(${posts.publishedAt}, now())`,
  };
}

/**
 * id 글을 published 로 전환.
 * @returns 전환된 글의 { id, slug }, 대상이 없으면 null
 */
export async function setPostPublished(
  id: string,
): Promise<{ id: string; slug: string } | null> {
  const rows = await getBlogDb()
    .update(posts)
    .set(publishSetValues())
    .where(eq(posts.id, id))
    .returning({ id: posts.id, slug: posts.slug });

  return rows[0] ?? null;
}

/**
 * id 글을 draft 로 되돌림 (published_at 은 보존).
 * @returns { id }, 대상이 없으면 null
 */
export async function setPostUnpublished(
  id: string,
): Promise<{ id: string } | null> {
  const rows = await getBlogDb()
    .update(posts)
    .set({ status: 'draft' })
    .where(eq(posts.id, id))
    .returning({ id: posts.id });

  return rows[0] ?? null;
}
