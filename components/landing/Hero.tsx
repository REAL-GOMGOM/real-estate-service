'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useRotatingPlaceholder } from '@/hooks/useRotatingPlaceholder';
import { LiveTicker, type TickerItem } from './LiveTicker';

interface HeroProps {
  ticker: TickerItem[];
}

const TAGS = ['강남구', '분당', '마포구', '용산구', '청약 일정'];

/**
 * 사이클 U 메인 히어로 — 시안 스크린 12 기준.
 * 다크 네이비 배경 + 좌정렬 카피 + 검색 박스 + 하단 LIVE 티커 스트립.
 */
export function Hero({ ticker }: HeroProps) {
  const placeholder = useRotatingPlaceholder();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [dataMonth, setDataMonth] = useState('');

  const handleSubmit = (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) { router.push('/region'); return; }
    if (q.includes('청약')) { router.push('/subscription'); return; }
    router.push(`/region?q=${encodeURIComponent(q)}`);
  };

  useEffect(() => {
    const now = new Date();
    setDataMonth(`${now.getFullYear()}년 ${now.getMonth() + 1}월`);
  }, []);

  return (
    <section
      className="relative overflow-hidden"
      style={{
        paddingTop: '64px',
        background: 'linear-gradient(160deg, #0E1830 0%, #14213D 50%, #0E2A66 100%)',
      }}
    >
      <div
        className="relative z-10 mx-auto"
        style={{ maxWidth: 'var(--container-default)', padding: '0 var(--page-padding)' }}
      >
        <div style={{ maxWidth: '720px', padding: 'clamp(36px, 6vw, 52px) 0 30px' }}>
          {/* 라이브 인디케이터 */}
          <div
            className="inline-flex items-center gap-2 rounded-full"
            style={{
              backgroundColor: 'rgba(255,255,255,0.1)',
              color: '#CFE0FF',
              fontWeight: 700,
              fontSize: '12px',
              padding: '5px 12px',
              marginBottom: '18px',
            }}
          >
            <span className="relative flex">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#5AE0A0' }} />
              <span
                className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
                style={{ backgroundColor: '#5AE0A0', opacity: 0.6 }}
              />
            </span>
            {dataMonth ? `${dataMonth} 실거래 데이터 실시간 반영 중` : '실거래 데이터 실시간 반영 중'}
          </div>

          {/* 대형 타이틀 */}
          <h1
            style={{
              margin: '0 0 12px',
              fontSize: 'clamp(34px, 5vw, 46px)',
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-1px',
              color: '#FFFFFF',
            }}
          >
            집값이 궁금할 때,
            <br />
            가장 먼저 여는 곳
          </h1>

          {/* 서브카피 */}
          <p
            style={{
              margin: '0 0 22px',
              fontSize: '16px',
              lineHeight: 1.6,
              color: '#B9C8E8',
              maxWidth: '34rem',
            }}
          >
            공식 실거래가·입지 점수·청약 일정을 한 화면에.
            <br />
            주요 거래를 요약하고 출처까지 바로 확인하세요.
          </p>

          {/* 검색 박스 */}
          <div
            className="flex items-center gap-2"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              padding: '6px 6px 6px 16px',
              maxWidth: '440px',
              marginBottom: '16px',
            }}
          >
            <Search size={17} style={{ color: '#9AA4B8', flexShrink: 0 }} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
              }}
              placeholder={placeholder}
              aria-label="단지명·지역 검색"
              className="w-full outline-none"
              style={{
                border: 'none',
                fontSize: '14px',
                color: '#14213D',
                backgroundColor: 'transparent',
                minWidth: 0,
              }}
            />
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="cursor-pointer transition-opacity hover:opacity-90"
              style={{
                border: 'none',
                backgroundColor: '#1B4DDB',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '13px',
                padding: '9px 18px',
                borderRadius: '9px',
                flexShrink: 0,
              }}
            >
              검색
            </button>
          </div>

          {/* 태그 칩 */}
          <div className="flex flex-wrap gap-2" style={{ paddingBottom: '34px' }}>
            {TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleSubmit(tag)}
                className="rounded-full cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  color: '#CFE0FF',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 하단 LIVE 티커 스트립 (풀폭) */}
      <LiveTicker items={ticker} />
    </section>
  );
}
