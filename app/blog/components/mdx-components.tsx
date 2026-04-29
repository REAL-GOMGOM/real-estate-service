import Link from 'next/link';
import type { MDXComponents } from 'mdx/types';

/**
 * MDX 렌더 시 사용할 컴포넌트 화이트리스트.
 *
 * 표준 HTML 태그만 허용 — 임의 React 컴포넌트 호출 차단.
 *
 * 외부 링크: rel='noopener noreferrer' + target='_blank'
 * 내부 링크 (/로 시작): Next.js Link 사용
 *
 * 향후 (Phase 2):
 * - 커스텀 위젯 추가 가능 (Callout, RegionPriceChart 등)
 * - 그땐 컴포넌트 명시적 import 후 이 화이트리스트에 등록
 */
export const mdxComponents: MDXComponents = {
  a: ({ href, children, ...props }) => {
    const isExternal = !!href && /^(https?:|mailto:|tel:)/.test(href);
    if (isExternal) {
      return (
        <a href={href} rel="noopener noreferrer" target="_blank" {...props}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href ?? '#'} {...(props as Record<string, unknown>)}>
        {children}
      </Link>
    );
  },
  img: ({ src, alt, ...props }) => {
    if (!src || typeof src !== 'string') return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt ?? ''} loading="lazy" {...props} />;
  },
};
