'use client';

import Link from 'next/link';
import { BarChart3, MapPin, Calendar, ArrowRight } from 'lucide-react';
import { BRAND } from '@/lib/design-tokens';
import { Reveal } from '@/components/shared/Reveal';

const SERVICES = [
  {
    tag: '실시간 업데이트',
    tagColor: BRAND.terracotta,
    title: '시세 차트 분석',
    desc: '서울 및 수도권 주요 지역의 실거래가 시세를 차트로 분석하세요. 이동평균, 거래량, 변동률을 한눈에 확인합니다.',
    icon: BarChart3,
    href: '/market',
    dark: false,
  },
  {
    tag: '26년 4월 업데이트',
    tagColor: BRAND.amber,
    title: '입지 점수 지도',
    desc: '매월 업데이트되는 서울 전역 입지 점수를 지도 위에서 확인하세요. 상승·하락 트렌드와 함께 최적의 입지를 찾아보세요.',
    icon: MapPin,
    href: '/location-map',
    dark: true,
  },
  {
    tag: '일정 관리',
    tagColor: BRAND.amber,
    title: '청약 정보',
    desc: '수도권 청약 일정, 경쟁률, 분양가 정보를 한 곳에서 확인하세요. 관심 단지를 설정하고 마감일 알림을 받으세요.',
    icon: Calendar,
    href: '/subscription',
    dark: false,
  },
] as const;

export function CoreServices() {
  return (
    <section style={{ backgroundColor: '#FFFFFF', padding: 'clamp(40px, 8vw, 80px) 0' }}>
      <div style={{ maxWidth: 'var(--container-default)', margin: '0 auto', padding: '0 var(--page-padding)' }}>
        {/* 헤더 */}
        <Reveal>
          <div className="text-center mb-14">
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: BRAND.terracottaText }}
            >
              TOTAL REAL ESTATE SERVICE
            </span>
            <h2
              className="mt-3"
              style={{
                fontSize: 'clamp(24px, 4vw, 36px)',
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: '-0.025em',
                color: BRAND.ink,
              }}
            >
              투자 결정에 필요한
              <br />
              모든 데이터를 한 곳에
            </h2>
          </div>
        </Reveal>

        {/* 카드 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {SERVICES.map((s, i) => {
            const Icon = s.icon;
            const isDark = s.dark;

            const bg = isDark ? BRAND.ink : '#FFFFFF';
            const textColor = isDark ? '#FFFFFF' : BRAND.ink;
            const descColor = isDark ? 'rgba(255,255,255,0.7)' : BRAND.inkSoft;
            const iconColor = isDark ? BRAND.amber : s.tagColor;
            const tagBg = isDark ? `${BRAND.amber}25` : `${s.tagColor}12`;
            const tagText = isDark ? BRAND.amber : s.tagColor;
            const ctaColor = isDark ? BRAND.amber : BRAND.terracottaText;
            const borderColor = isDark ? 'transparent' : BRAND.line;

            return (
              <Reveal key={s.title} delay={i * 120}>
                <Link href={s.href} className="block group" style={{ textDecoration: 'none' }}>
                  <div
                    className="h-full rounded-3xl border p-8 transition-all duration-300 hover:-translate-y-2 hover:shadow-lg"
                    style={{ backgroundColor: bg, borderColor }}
                  >
                    {/* 태그 뱃지 */}
                    <span
                      className="inline-block rounded-full px-3 py-1 text-xs font-medium mb-6"
                      style={{ backgroundColor: tagBg, color: tagText }}
                    >
                      {s.tag}
                    </span>

                    {/* 아이콘 */}
                    <div className="mb-5">
                      <Icon
                        size={40}
                        strokeWidth={1.5}
                        style={{ color: iconColor }}
                        className="transition-transform duration-300 group-hover:scale-110 origin-left"
                      />
                    </div>

                    {/* 제목 */}
                    <h3
                      className="text-xl font-bold mb-3"
                      style={{ color: textColor }}
                    >
                      {s.title}
                    </h3>

                    {/* 설명 */}
                    <p
                      className="text-sm leading-relaxed mb-8"
                      style={{ color: descColor }}
                    >
                      {s.desc}
                    </p>

                    {/* CTA */}
                    <div
                      className="flex items-center gap-1.5 text-sm font-semibold"
                      style={{ color: ctaColor }}
                    >
                      자세히 보기
                      <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
