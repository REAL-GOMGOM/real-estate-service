import Link from 'next/link';
import type { PublicPostListItem } from '@/lib/blog/queries';

const KST_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Seoul',
};

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('ko-KR', KST_DATE_FORMAT).format(d);
}

/**
 * 칼럼 카드 (목록용).
 *
 * 썸네일은 항상 "제목형 카드" — OG 이미지 디자인을 CSS로 재현 (2026-07-12, Eric 결정).
 * - 커버 이미지가 있어도 목록에서는 쓰지 않는다 (통일된 룩, 수동 커버 채우기 불필요)
 * - opengraph-image 직접 재사용안은 목록 열람마다 satori 렌더를 유발해
 *   Vercel Fluid CPU를 태우므로 순수 CSS로 그린다
 * - 커버는 상세 페이지·소셜 공유(OG)에서는 계속 사용됨
 */
export function PostCard({ post }: { post: PublicPostListItem }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
    >
      {/* 제목형 썸네일 — 카테고리 필 / 제목 / 날짜·브랜드 */}
      <div
        aria-hidden="true"
        className="relative flex aspect-[16/9] flex-col justify-between overflow-hidden p-4"
        style={{ background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' }}
      >
        <div>
          {post.categoryName && (
            <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: '#0f172a' }}>
              {post.categoryName}
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-base font-bold leading-snug" style={{ color: '#0f172a' }}>
          {post.title}
        </p>
        <div className="flex items-center justify-between text-[10px]" style={{ color: '#475569' }}>
          <span>{fmtDate(post.publishedAt)}</span>
          <span className="font-bold" style={{ color: '#0f172a' }}>내집(My.ZIP)</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        {post.categoryName && (
          <span className="self-start rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {post.categoryName}
          </span>
        )}
        <h3 className="mt-2 text-base font-semibold text-slate-900 group-hover:text-slate-700">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{post.excerpt}</p>
        )}
        <time className="mt-3 text-xs text-slate-400" dateTime={post.publishedAt.toISOString()}>
          {fmtDate(post.publishedAt)}
        </time>
      </div>
    </Link>
  );
}
