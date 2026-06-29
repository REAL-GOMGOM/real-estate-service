import 'server-only';
import { eq, like, or } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { posts } from '@/lib/db/schema';

/**
 * slug 생성·유니크 보장 유틸.
 *
 * posts.slug 는 unique, 패턴 /^[a-z0-9-]{1,200}$/ 만 허용.
 * 머신 발행 API 가 제목으로부터 slug 를 자동 생성할 때 사용한다.
 */

const SLUG_MAX = 200;
const FALLBACK_BASE = 'post';

/**
 * 임의 문자열 → slug 정규화 (폴백 없음).
 *
 * 소문자화 후 ascii 영숫자만 남기고 나머지는 하이픈으로, 연속/양끝 하이픈 정리.
 * 한글 등 비-ascii 문자는 제거되므로, 쓸 만한 문자가 없으면 빈 문자열('')을 반환한다.
 *
 * 신뢰 불가 입력(클라이언트가 보낸 slug 등)도 이 함수를 거치면 안전한 slug 가 된다.
 * 호출부가 빈 문자열을 보고 폴백 여부를 결정한다.
 */
export function normalizeSlug(input: string): string {
  return (input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // 영숫자 외 → 하이픈
    .replace(/-+/g, '-') // 연속 하이픈 축약
    .replace(/^-|-$/g, '') // 양끝 하이픈 제거
    .slice(0, SLUG_MAX);
}

/**
 * 제목 → slug base 문자열.
 *
 * normalizeSlug 결과가 비면(순수 한글 제목 등) FALLBACK_BASE('post')로 떨어진다.
 * (한글 로마자화는 향후 후보)
 */
export function slugifyBase(title: string): string {
  const base = normalizeSlug(title);
  return base.length > 0 ? base : FALLBACK_BASE;
}

/**
 * base 와 충돌하지 않는 유니크 slug 반환.
 *
 * 충돌 시 `-2`, `-3` … suffix 부여. DB 한 번 조회로 base 및 base-* 를 모두 가져와
 * 메모리에서 빈 번호를 찾는다 (N+1 쿼리 방지).
 */
export async function ensureUniqueSlug(base: string): Promise<string> {
  const rows = await getBlogDb()
    .select({ slug: posts.slug })
    .from(posts)
    .where(or(eq(posts.slug, base), like(posts.slug, `${base}-%`)));

  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;

  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * 제목으로부터 바로 유니크 slug 생성 (slugifyBase + ensureUniqueSlug).
 */
export async function generateUniqueSlug(title: string): Promise<string> {
  return ensureUniqueSlug(slugifyBase(title));
}
