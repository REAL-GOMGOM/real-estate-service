'use client';

import { BRAND } from '@/lib/design-tokens';
import { Reveal } from '@/components/shared/Reveal';

// 텔레그램 채널 배너 (컴포넌트/파일명 rename은 리디자인 사이클에서 처리)
export function KakaoBanner() {
  const url = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL;

  if (!url) return null;

  return (
    <section className="py-16" style={{ backgroundColor: '#FBF7F1' }}>
      <div style={{ maxWidth: 'var(--container-default)', margin: '0 auto', padding: '0 var(--page-padding)' }}>
        <Reveal>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-3xl p-8 md:p-10 transition-all duration-300 hover:shadow-lg group"
            style={{
              background: 'linear-gradient(135deg, #2AABEE 0%, #229ED9 100%)',
              border: '1px solid rgba(0,0,0,0.05)',
            }}
          >
            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
              {/* 텔레그램 아이콘 원형 */}
              <div
                className="flex-shrink-0 w-20 h-20 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <svg
                  aria-hidden="true"
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 2 11 13" />
                  <path d="m22 2-7 20-4-9-9-4 20-7z" />
                </svg>
              </div>

              {/* 텍스트 */}
              <div className="flex-1 text-center md:text-left">
                <div
                  className="text-xs font-medium tracking-wider mb-2"
                  style={{ color: 'rgba(255,255,255,0.75)' }}
                >
                  CHANNEL
                </div>
                <h3
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: 'white',
                    letterSpacing: '-0.02em',
                  }}
                >
                  내집 텔레그램 채널에서 부동산 정보 받아보세요
                </h3>
                <p
                  className="mt-2 text-sm"
                  style={{ color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}
                >
                  실거래 신고가·시장 분석·새 칼럼 소식을 가장 빠르게 받는 채널
                </p>
              </div>

              {/* CTA 버튼 */}
              <div
                className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all group-hover:scale-105"
                style={{
                  backgroundColor: 'white',
                  color: '#229ED9',
                  fontSize: 15,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                채널 참여하기
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </a>
        </Reveal>
      </div>
    </section>
  );
}
