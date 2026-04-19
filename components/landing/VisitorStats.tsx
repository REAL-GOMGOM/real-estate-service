'use client';

import { useEffect } from 'react';
import { BRAND } from '@/lib/design-tokens';
import { useInView } from '@/hooks/useInView';
import { useCountUp } from '@/hooks/useCountUp';
import type { VisitorStatsData } from '@/lib/visitor-tracking';

const CARDS: readonly {
  key: 'today' | 'active24h' | 'total';
  label: string;
  color: string;
  duration: number;
  pulse?: boolean;
  sub?: string;
}[] = [
  { key: 'today', label: '오늘 방문', color: BRAND.terracotta, duration: 1600 },
  { key: 'active24h', label: '지난 24시간 활성', color: BRAND.sage, duration: 2000 },
  { key: 'total', label: '누적 방문자', color: BRAND.amber, duration: 1200, pulse: true, sub: '(2026.4부터)' },
];

interface Props {
  initialStats: VisitorStatsData;
}

export function VisitorStats({ initialStats }: Props) {
  useEffect(() => {
    fetch('/api/track', { method: 'POST' }).catch(() => {});
  }, []);

  const { ref, inView } = useInView(0.15);
  const values = {
    today: useCountUp(initialStats.today, inView, 1600),
    active24h: useCountUp(initialStats.active24h, inView, 2000),
    total: useCountUp(initialStats.total, inView, 1200),
  };

  return (
    <div ref={ref} className="grid grid-cols-3 gap-3">
      {CARDS.map((card) => (
        <div
          key={card.key}
          className="flex flex-col items-center gap-1.5 rounded-2xl border py-4 px-2"
          style={{
            backgroundColor: '#FFFFFF',
            borderColor: BRAND.line,
          }}
        >
          {/* 라벨 + 닷 */}
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="relative flex">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: card.color }}
              />
              {card.pulse && (
                <span
                  className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
                  style={{ backgroundColor: card.color, opacity: 0.6 }}
                />
              )}
            </span>
            <span className="text-xs" style={{ color: BRAND.inkSoft }}>
              {card.label}
            </span>
          </div>

          {/* 숫자 */}
          <span
            className="font-bold"
            style={{
              fontSize: 'clamp(18px, 3vw, 26px)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              color: BRAND.ink,
            }}
          >
            {values[card.key].toLocaleString()}
          </span>

          {/* 서브텍스트 */}
          {card.sub && (
            <span className="text-xs mt-0.5" style={{ color: BRAND.inkSoft, opacity: 0.6 }}>
              {card.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
