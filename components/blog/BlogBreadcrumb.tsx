import Link from 'next/link';

// 칼럼 영역 breadcrumb 컴포넌트
// - variant 'category': 홈 > 칼럼 > {카테고리명} (마지막)
// - variant 'post':     홈 > 칼럼 > {카테고리명} > {글 제목} (마지막)
type BlogBreadcrumbProps =
  | { variant: 'category'; categoryName: string }
  | {
      variant: 'post';
      categorySlug: string;
      categoryName: string;
      postTitle: string;
    };

// 단계 구분자 — RegionBreadcrumb 일관
const STEP_SEPARATOR = '›';

// 링크 항목 — slate 평소 색 + accent hover (Plan v2 결정 B)
const LINK_CLASS =
  'transition-colors hover:text-[var(--accent)] motion-reduce:transition-none';

// 현재 페이지(마지막) 항목 — 굵은 slate, 모바일 truncate
const CURRENT_CLASS =
  'truncate max-w-[16rem] sm:max-w-[24rem] lg:max-w-none text-slate-900 font-medium';

export default function BlogBreadcrumb(props: BlogBreadcrumbProps) {
  return (
    <nav aria-label="breadcrumb" className="text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className={LINK_CLASS}>
            홈
          </Link>
        </li>
        <li aria-hidden="true">{STEP_SEPARATOR}</li>
        <li>
          <Link href="/blog" className={LINK_CLASS}>
            칼럼
          </Link>
        </li>
        <li aria-hidden="true">{STEP_SEPARATOR}</li>

        {props.variant === 'category' ? (
          <li>
            <span className={CURRENT_CLASS} aria-current="page">
              {props.categoryName}
            </span>
          </li>
        ) : (
          <>
            <li>
              <Link
                href={`/blog/category/${props.categorySlug}`}
                className={LINK_CLASS}
              >
                {props.categoryName}
              </Link>
            </li>
            <li aria-hidden="true">{STEP_SEPARATOR}</li>
            <li>
              <span className={CURRENT_CLASS} aria-current="page">
                {props.postTitle}
              </span>
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
