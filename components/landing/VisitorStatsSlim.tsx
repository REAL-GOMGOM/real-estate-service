'use client';

import { useEffect } from 'react';
import { BRAND } from '@/lib/design-tokens';
import type { VisitorStatsData } from '@/lib/visitor-tracking';

interface Props {
  initialStats: VisitorStatsData;
}

export function VisitorStatsSlim({ initialStats }: Props) {
  useEffect(() => {
    fetch('/api/track', { method: 'POST' }).catch(() => {});
  }, []);

  return (
    <div
      className="mx-auto max-w-5xl px-4 md:px-6 py-6 border-t"
      style={{ borderColor: BRAND.line }}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: BRAND.terracotta }}
          />
          <span style={{ color: BRAND.inkSoft }}>오늘 방문</span>
          <span className="font-semibold tabular-nums" style={{ color: BRAND.ink }}>
            {initialStats.today.toLocaleString('ko-KR')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: BRAND.sage }}
          />
          <span style={{ color: BRAND.inkSoft }}>지난 24시간</span>
          <span className="font-semibold tabular-nums" style={{ color: BRAND.ink }}>
            {initialStats.active24h.toLocaleString('ko-KR')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: BRAND.amber }}
          />
          <span style={{ color: BRAND.inkSoft }}>누적</span>
          <span className="font-semibold tabular-nums" style={{ color: BRAND.ink }}>
            {initialStats.total.toLocaleString('ko-KR')}
          </span>
          <span className="text-xs" style={{ color: BRAND.inkSoft }}>
            (2026.4~)
          </span>
        </div>
      </div>
    </div>
  );
}
