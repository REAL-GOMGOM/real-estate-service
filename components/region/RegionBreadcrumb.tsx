import Link from 'next/link';
import type { RegionDetail } from '@/lib/types';

interface Props {
  region: RegionDetail;
}

export function RegionBreadcrumb({ region }: Props) {
  const regionParam = encodeURIComponent(region.region);

  return (
    <nav
      aria-label="breadcrumb"
      className="mx-auto max-w-5xl px-4 md:px-6 py-4 text-sm"
      style={{ color: 'var(--text-muted)' }}
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className="hover:opacity-70 transition-opacity motion-reduce:transition-none">
            홈
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li>
          <Link href="/location-map" className="hover:opacity-70 transition-opacity motion-reduce:transition-none">
            입지지도
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li>
          <Link
            href={`/location-map?region=${regionParam}`}
            className="hover:opacity-70 transition-opacity motion-reduce:transition-none"
          >
            {region.region}
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li style={{ color: 'var(--text-primary)', fontWeight: 500 }} aria-current="page">
          {region.name}
        </li>
      </ol>
    </nav>
  );
}
