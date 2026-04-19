'use client';

import { MapPin } from 'lucide-react';
import { BRAND } from '@/lib/design-tokens';

export interface TickerItem {
  region: string;
  apt: string;
  price: string;
  area: string;
  time: string;
}

interface LiveTickerProps {
  items: TickerItem[];
}

export function LiveTicker({ items }: LiveTickerProps) {
  const doubled = items.length > 0 ? [...items, ...items] : [];

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ backgroundColor: '#FFFFFF', borderColor: BRAND.line }}
    >
      {/* 티커 keyframes */}
      <style>{`
        @keyframes naezipTicker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .naezip-ticker-track {
          animation: naezipTicker 60s linear infinite;
          width: max-content;
        }
        .naezip-ticker-track:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: BRAND.line }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: BRAND.danger }}
            />
            <span
              className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
              style={{ backgroundColor: BRAND.danger, opacity: 0.6 }}
            />
          </span>
          <span className="text-xs font-semibold" style={{ color: BRAND.ink }}>
            LIVE
          </span>
          <span className="text-xs" style={{ color: BRAND.inkSoft }}>
            · 최근 실거래
          </span>
        </div>
        <div className="hidden md:flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BRAND.sage }} />
          <span className="text-xs" style={{ color: BRAND.sageText }}>
            15분 전 업데이트
          </span>
        </div>
      </div>

      {/* Body — 무한 스크롤 */}
      <div className="relative py-3">
        {/* 좌측 페이드 마스크 */}
        <div
          className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to right, #FFFFFF, transparent)',
          }}
        />
        {/* 우측 페이드 마스크 */}
        <div
          className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to left, #FFFFFF, transparent)',
          }}
        />

        {items.length === 0 ? (
          <div className="text-center py-2 text-sm" style={{ color: BRAND.inkSoft }}>
            최신 실거래 데이터를 불러오는 중...
          </div>
        ) : (
          <div className="overflow-hidden">
            <div className="naezip-ticker-track flex items-center gap-6 px-4">
              {doubled.map((item, i) => (
                <div
                  key={`${item.region}-${item.apt}-${i}`}
                  className="flex items-center gap-1.5 shrink-0"
                >
                  <MapPin size={13} style={{ color: BRAND.inkSoft }} />
                  <span className="text-sm" style={{ color: BRAND.ink }}>
                    {item.region}
                  </span>
                  <span className="text-xs" style={{ color: BRAND.inkSoft }}>·</span>
                  <span className="text-sm" style={{ color: BRAND.ink }}>
                    {item.apt}
                  </span>
                  <span className="text-xs" style={{ color: BRAND.inkSoft }}>·</span>
                  <span
                    className="font-bold"
                    style={{ fontSize: '15px', color: BRAND.terracotta }}
                  >
                    {item.price}
                  </span>
                  <span className="text-xs" style={{ color: BRAND.inkSoft }}>
                    {item.area}
                  </span>
                  <span className="text-xs" style={{ color: BRAND.sageText }}>
                    {item.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2 border-t text-center"
        style={{ borderColor: BRAND.line, backgroundColor: `${BRAND.paper}66` }}
      >
        <span className="text-xs" style={{ color: BRAND.inkSoft }}>
          데이터 출처 · 국토교통부 · 한국부동산원 · NEIS
        </span>
      </div>
    </div>
  );
}
