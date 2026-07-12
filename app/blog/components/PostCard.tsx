import Image from 'next/image';
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
 * 커버 이미지 있으면 표시, 없으면 텍스트 only.
 * 카테고리 배지로 시각 분류.
 */
export function PostCard({ post }: { post: PublicPostListItem }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
    >
      {post.coverImageUrl ? (
        <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
          <Image
            src={post.coverImageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition group-hover:scale-105"
          />
        </div>
      ) : (
        /* 커버 미지정 → CSS 플레이스홀더.
           (opengraph-image 재사용안은 목록 열람마다 satori 렌더를 유발해
            Vercel Fluid CPU를 태우므로 폐기 — 2026-07-12) */
        <div
          aria-hidden="true"
          className="relative flex aspect-[16/9] items-center justify-center overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #F4F7FE 0%, #E3EAFB 55%, #D6E0F7 100%)' }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <Image src="/logo.png" alt="" width={44} height={44} className="opacity-90" />
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: '#8296C4' }}>
              내집 칼럼
            </span>
          </div>
        </div>
      )}

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
