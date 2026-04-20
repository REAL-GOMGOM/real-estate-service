'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { BRAND } from '@/lib/design-tokens';
import { useRotatingPlaceholder } from '@/hooks/useRotatingPlaceholder';
import { QuickAccess } from './QuickAccess';
import { LiveTicker, type TickerItem } from './LiveTicker';

interface HeroProps {
  ticker: TickerItem[];
}

const TAGS = ['강남구', '분당', '마포구', '용산구', '청약 일정'];

export function Hero({ ticker }: HeroProps) {
  const placeholder = useRotatingPlaceholder();
  const [dataMonth, setDataMonth] = useState('');

  useEffect(() => {
    const now = new Date();
    setDataMonth(`${now.getFullYear()}년 ${now.getMonth() + 1}월`);
  }, []);

  return (
    <section
      className="relative overflow-hidden"
      style={{
        paddingTop: '80px',
        paddingBottom: '48px',
        backgroundColor: BRAND.bg,
      }}
    >
      {/* 배경 glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            top: '10%',
            right: '15%',
            width: '500px',
            height: '500px',
            backgroundColor: BRAND.terracotta,
            opacity: 0.08,
          }}
        />
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            bottom: '20%',
            left: '10%',
            width: '400px',
            height: '400px',
            backgroundColor: BRAND.amber,
            opacity: 0.07,
          }}
        />
        <div
          className="absolute rounded-full blur-3xl"
          style={{
            top: '40%',
            left: '50%',
            width: '350px',
            height: '350px',
            backgroundColor: BRAND.sage,
            opacity: 0.06,
          }}
        />
      </div>

      <div
        className="relative z-10 mx-auto"
        style={{
          maxWidth: '720px',
          padding: '0 var(--page-padding)',
        }}
      >
        {/* 라이브 인디케이터 */}
        <div className="flex justify-center mb-6">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-2"
            style={{
              backgroundColor: `${BRAND.terracotta}10`,
              border: `1px solid ${BRAND.terracotta}25`,
            }}
          >
            <span className="relative flex">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: BRAND.terracotta }}
              />
              <span
                className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
                style={{ backgroundColor: BRAND.terracotta, opacity: 0.6 }}
              />
            </span>
            <span className="text-xs font-medium" style={{ color: BRAND.terracottaText }}>
              {dataMonth ? `${dataMonth} 실거래 데이터 실시간 반영 중` : '실거래 데이터 실시간 반영 중'}
            </span>
          </div>
        </div>

        {/* 대형 타이틀 */}
        <h1
          className="text-center mb-4"
          style={{
            fontSize: 'clamp(40px, 6vw, 72px)',
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.035em',
            color: BRAND.ink,
          }}
        >
          부동산의 모든 답을,
          <br />
          <span style={{ color: BRAND.terracotta }}>한 곳에 압축</span>
        </h1>

        {/* 서브카피 */}
        <p
          className="text-center mx-auto mb-8"
          style={{
            maxWidth: '36rem',
            fontSize: '17px',
            lineHeight: 1.7,
            color: BRAND.inkSoft,
          }}
        >
          집값이 궁금할 때, 투자할 지 고민될 때, 우리 동네 뭐가 생기는지 알고 싶을 때
          <br />
          <strong style={{ fontWeight: 700, color: '#C4654A' }}>내집(My.ZIP)</strong>이 모든 답을 쉽게 전해드립니다.
        </p>

        {/* 검색바 */}
        <div className="relative mb-4 mx-auto" style={{ maxWidth: '480px' }}>
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: BRAND.inkSoft }}
          />
          <input
            type="text"
            readOnly
            placeholder={placeholder}
            className="w-full rounded-full border py-3.5 pl-11 pr-5 text-sm outline-none transition-colors duration-200"
            style={{
              borderColor: BRAND.line,
              backgroundColor: '#FFFFFF',
              color: BRAND.ink,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = BRAND.terracotta;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = BRAND.line;
            }}
          />
        </div>

        {/* 태그 칩 */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {TAGS.map((tag) => (
            <span
              key={tag}
              className="rounded-full px-3 py-1 text-xs font-medium cursor-default"
              style={{
                backgroundColor: `${BRAND.terracotta}08`,
                color: BRAND.terracottaText,
                border: `1px solid ${BRAND.terracotta}15`,
              }}
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* Quick Access */}
        <div className="mb-6">
          <QuickAccess />
        </div>

        {/* Live Ticker */}
        <LiveTicker items={ticker} />
      </div>
    </section>
  );
}
