'use client';

import Link from 'next/link';
import { MapPin, ArrowRight } from 'lucide-react';
import { BRAND } from '@/lib/design-tokens';
import { Reveal } from '@/components/shared/Reveal';

export interface Subscription {
  status: '청약 중' | '청약 예정' | '청약 마감';
  name: string;
  loc: string;
  period: string;
  units: number;
  comp: string;
}

interface SubscriptionListProps {
  items: Subscription[];
}

const STATUS_COLORS: Record<Subscription['status'], string> = {
  '청약 중': BRAND.terracotta,
  '청약 예정': BRAND.sage,
  '청약 마감': BRAND.inkSoft,
};

export function SubscriptionList({ items }: SubscriptionListProps) {
  return (
    <section style={{ backgroundColor: '#FFFFFF', padding: 'clamp(40px, 8vw, 80px) 0' }}>
      <div style={{ maxWidth: 'var(--container-default)', margin: '0 auto', padding: '0 var(--page-padding)' }}>
        {/* 헤더 */}
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-10">
            <div>
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: BRAND.terracottaText }}
              >
                SUBSCRIPTION
              </span>
              <h2
                className="mt-2"
                style={{
                  fontSize: 'clamp(24px, 4vw, 36px)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: BRAND.ink,
                }}
              >
                수도권 주요 청약 일정
              </h2>
            </div>
            <Link
              href="/subscription"
              className="hidden md:flex items-center gap-1 text-sm font-semibold mt-4 md:mt-0 group"
              style={{ color: BRAND.terracottaText }}
            >
              전체 일정 보기
              <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>

        {/* 카드 그리드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {items.map((sub, i) => {
            const statusColor = STATUS_COLORS[sub.status];
            const isComp = sub.comp !== '미발표';

            return (
              <Reveal key={`${sub.name}-${i}`} delay={i * 100}>
                <div
                  className="rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-default"
                  style={{ backgroundColor: '#FFFFFF', borderColor: BRAND.line }}
                >
                  {/* 상태 뱃지 */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="relative flex">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: statusColor }}
                      />
                      {sub.status === '청약 중' && (
                        <span
                          className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
                          style={{ backgroundColor: statusColor, opacity: 0.6 }}
                        />
                      )}
                    </span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: statusColor }}
                    >
                      {sub.status}
                    </span>
                  </div>

                  {/* 단지명 */}
                  <h3
                    className="font-semibold mb-2"
                    style={{
                      fontSize: '17px',
                      lineHeight: 1.4,
                      color: BRAND.ink,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {sub.name}
                  </h3>

                  {/* 위치 */}
                  <div className="flex items-center gap-1 mb-4">
                    <MapPin size={13} style={{ color: BRAND.inkSoft }} />
                    <span className="text-xs" style={{ color: BRAND.inkSoft }}>
                      {sub.loc}
                    </span>
                  </div>

                  {/* 점선 divider */}
                  <div
                    className="mb-4"
                    style={{ borderTop: `1px dashed ${BRAND.line}` }}
                  />

                  {/* 정보 행 */}
                  <div className="space-y-2.5">
                    <Row label="청약 기간" value={sub.period} />
                    <Row label="세대수" value={`${sub.units.toLocaleString()}세대`} />
                    <Row
                      label="경쟁률"
                      value={sub.comp}
                      valueColor={isComp ? BRAND.terracotta : undefined}
                      bold={isComp}
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

function Row({
  label,
  value,
  valueColor,
  bold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: BRAND.inkSoft }}>
        {label}
      </span>
      <span
        className="text-sm"
        style={{
          color: valueColor ?? BRAND.ink,
          fontWeight: bold ? 600 : 400,
        }}
      >
        {value}
      </span>
    </div>
  );
}
