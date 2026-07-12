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
        /* 커버 미지정 → 글별 자동 생성 OG 이미지 재사용 (발행 파이프라인 무변경) */
        <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
          <Image
            src={`/blog/${post.slug}/opengraph-image`}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition group-hover:scale-105"
          />
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
