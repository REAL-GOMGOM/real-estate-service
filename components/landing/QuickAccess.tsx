'use client';

import Link from 'next/link';
import { MapPin, BarChart3, Calendar, TrendingUp, FileText } from 'lucide-react';
import { BRAND } from '@/lib/design-tokens';

const ITEMS = [
  { icon: MapPin, label: '부동산 지도', sub: '입지 점수', color: BRAND.terracotta, href: '/location-map' },
  { icon: BarChart3, label: '실거래 조회', sub: '구·단지별', color: BRAND.sage, href: '/transactions' },
  { icon: Calendar, label: '청약 정보', sub: '일정·경쟁률', color: BRAND.amber, href: '/subscription' },
  { icon: TrendingUp, label: '변동률 지도', sub: '상승·하락', color: BRAND.terracotta, href: '/price-map' },
  { icon: FileText, label: '칼럼', sub: '주간 인사이트', color: BRAND.sage, href: '/blog' },
] as const;

export function QuickAccess() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="group flex flex-col items-center gap-2 rounded-2xl border py-5 px-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm"
            style={{
              backgroundColor: '#FFFFFF',
              borderColor: BRAND.line,
            }}
          >
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl transition-transform duration-300 group-hover:scale-110"
              style={{ backgroundColor: `${item.color}15` }}
            >
              <Icon size={20} style={{ color: item.color }} />
            </div>
            <span className="text-sm font-semibold" style={{ color: BRAND.ink }}>
              {item.label}
            </span>
            <span className="text-xs" style={{ color: BRAND.inkSoft }}>
              {item.sub}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
