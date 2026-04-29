import Link from 'next/link';
import type { PublicCategory } from '@/lib/blog/queries';

/**
 * 카테고리 탭.
 *
 * 활성 탭은 active prop으로 결정.
 * '전체'는 currentSlug가 null일 때 활성.
 */
export function CategoryTabs({
  categories: cats,
  currentSlug,
}: {
  categories: PublicCategory[];
  currentSlug: string | null;
}) {
  return (
    <nav className="flex flex-wrap gap-2">
      <TabLink href="/blog" label="전체" active={currentSlug === null} />
      {cats.map((c) => (
        <TabLink
          key={c.id}
          href={`/blog/category/${c.slug}`}
          label={c.name}
          active={currentSlug === c.slug}
        />
      ))}
    </nav>
  );
}

function TabLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white'
          : 'rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50'
      }
    >
      {label}
    </Link>
  );
}
