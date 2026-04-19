import Link from 'next/link';
import type { RegionDetail } from '@/lib/types';

interface Props {
  region: RegionDetail;
}

export function RegionCTA({ region }: Props) {
  const kakaoUrl = process.env.NEXT_PUBLIC_KAKAO_OPENCHAT_URL;
  const mapUrl = `/location-map?highlight=${region.id}`;

  return (
    <section
      className="mx-auto max-w-5xl px-4 md:px-6 py-10 md:py-14 border-t"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex flex-col md:flex-row gap-3 md:gap-4 justify-center">
        <Link
          href={mapUrl}
          className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-white font-medium hover:opacity-90 transition-opacity motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2"
          style={{ backgroundColor: 'var(--text-strong)' }}
        >
          입지지도에서 {region.name} 보기 →
        </Link>

        {kakaoUrl && (
          <a
            href={kakaoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg border font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            내집 오픈카톡방 참여 →
          </a>
        )}
      </div>
    </section>
  );
}
