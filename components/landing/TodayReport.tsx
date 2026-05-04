'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { BRAND } from '@/lib/design-tokens';
import { Reveal } from '@/components/shared/Reveal';

export interface District {
  name: string;
  price: number;
  change: number;
}

interface TodayReportProps {
  districts: District[];
}

export function TodayReport({ districts }: TodayReportProps) {
  return (
    <section style={{ backgroundColor: BRAND.paper, padding: 'clamp(40px, 8vw, 80px) 0' }}>
      <div style={{ maxWidth: 'var(--container-default)', margin: '0 auto', padding: '0 var(--page-padding)' }}>
        {/* 헤더 */}
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-10">
            <div>
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: BRAND.sageText }}
              >
                TODAY&apos;S REPORT
              </span>
              <h2
                className="mt-2 mb-1"
                style={{
                  fontSize: 'clamp(24px, 4vw, 36px)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: BRAND.ink,
                }}
              >
                오늘의 수도권 실거래
              </h2>
              <p className="text-sm" style={{ color: BRAND.inkSoft }}>
                국토교통부 실거래가 공개시스템 기반
              </p>
            </div>
          </div>
        </Reveal>

        {/* 카드 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {districts.map((d, i) => {
            const isUp = d.change >= 0;
            const accentColor = isUp ? BRAND.terracotta : BRAND.sageText;
            const cardBg = isUp ? '#FBEFEA' : '#ECF2ED';
            const Icon = isUp ? TrendingUp : TrendingDown;
            const sign = isUp ? '+' : '';

            return (
              <Reveal key={d.name} delay={i * 80}>
                <div
                  className="group rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-default"
                  style={{ backgroundColor: '#FFFFFF', borderColor: BRAND.line }}
                >
                  {/* 구 이름 + 변동률 뱃지 */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-base font-semibold" style={{ color: BRAND.ink }}>
                      {d.name}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{ backgroundColor: cardBg, color: accentColor }}
                    >
                      <Icon size={12} />
                      {sign}{d.change.toFixed(1)}%
                    </span>
                  </div>

                  {/* 큰 가격 */}
                  <div className="mb-1">
                    <span
                      className="font-bold"
                      style={{
                        fontSize: 'clamp(22px, 3.5vw, 30px)',
                        color: BRAND.ink,
                        letterSpacing: '-0.02em',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {d.price.toFixed(1)}
                      <span className="text-base font-semibold" style={{ color: BRAND.inkSoft }}>억</span>
                    </span>
                  </div>
                  <p className="text-xs mb-4" style={{ color: BRAND.inkSoft }}>
                    평균 매매가 · 전월 대비
                  </p>

                  {/* Progress bar */}
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ backgroundColor: `${accentColor}15` }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: '40%',
                        backgroundColor: accentColor,
                      }}
                      ref={(el) => {
                        if (!el) return;
                        const parent = el.closest('.group');
                        if (!parent) return;
                        const enter = () => { el.style.width = '100%'; };
                        const leave = () => { el.style.width = '40%'; };
                        parent.addEventListener('mouseenter', enter);
                        parent.addEventListener('mouseleave', leave);
                      }}
                    />
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
