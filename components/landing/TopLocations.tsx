'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BRAND } from '@/lib/design-tokens';
import { Reveal } from '@/components/shared/Reveal';
import { RegionCard } from '@/components/region/RegionCard';

export interface TopLocation {
  rank: number;
  name: string;
  score: number;
  id: string;
}

interface TopLocationsProps {
  items: TopLocation[];
}

const LEGEND = [
  { label: '1.0~1.9 최우수', color: BRAND.terracotta },
  { label: '2.0~2.9 우수', color: BRAND.amber },
  { label: '3.0~3.9 보통', color: BRAND.sage },
];

export function TopLocations({ items }: TopLocationsProps) {
  return (
    <section style={{ backgroundColor: '#FBF7F1', padding: 'clamp(40px, 8vw, 80px) 0' }}>
      <div style={{ maxWidth: 'var(--container-default)', margin: '0 auto', padding: '0 var(--page-padding)' }}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 items-start">
          {/* 좌측: 헤더 + CTA + 범례 */}
          <Reveal className="md:col-span-2">
            <div>
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: BRAND.sageText }}
              >
                LOCATION SCORE · TOP 5
              </span>
              <h2
                className="mt-3 mb-4"
                style={{
                  fontSize: 'clamp(24px, 4vw, 36px)',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  letterSpacing: '-0.02em',
                  color: BRAND.ink,
                }}
              >
                전국 입지 점수,
                <br />
                이달의 최우수 지역
              </h2>
              <p className="text-sm leading-relaxed mb-8" style={{ color: BRAND.inkSoft }}>
                교통, 학군, 편의시설, 자연환경 등 다차원 지표를 종합한 입지 점수입니다.
                점수가 낮을수록 우수합니다.
              </p>

              {/* CTA 버튼 */}
              <Link
                href="/location-map"
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-opacity duration-200 hover:opacity-90 group mb-8"
                style={{ backgroundColor: BRAND.ink, color: '#FFFFFF' }}
              >
                전체 지도 보기
                <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
              </Link>

              {/* 범례 */}
              <div className="flex flex-wrap gap-4">
                {LEGEND.map((l) => (
                  <div key={l.label} className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: l.color }}
                    />
                    <span className="text-xs" style={{ color: BRAND.inkSoft }}>
                      {l.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* 우측: 랭킹 리스트 */}
          <div className="md:col-span-3 space-y-3">
            {items.map((item, i) => (
              <Reveal key={item.id} delay={i * 100}>
                <RegionCard
                  name={item.name}
                  score={item.score}
                  rank={item.rank}
                  href={`/region/${item.id}`}
                  isHighlight={item.rank === 1}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
