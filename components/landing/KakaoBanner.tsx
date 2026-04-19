'use client';

import { BRAND } from '@/lib/design-tokens';
import { Reveal } from '@/components/shared/Reveal';

export function KakaoBanner() {
  const url = process.env.NEXT_PUBLIC_KAKAO_OPENCHAT_URL;

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
              background: 'linear-gradient(135deg, #FEE500 0%, #FDD835 100%)',
              border: '1px solid rgba(0,0,0,0.05)',
            }}
          >
            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
              {/* 카카오 로고 원형 */}
              <div
                className="flex-shrink-0 w-20 h-20 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.3)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3C6.48 3 2 6.58 2 11c0 2.89 1.91 5.42 4.79 6.81L5.5 21.5l4.34-2.28c.7.13 1.42.19 2.16.19 5.52 0 10-3.58 10-8S17.52 3 12 3z"
                    fill="#391B1B"
                  />
                </svg>
              </div>

              {/* 텍스트 */}
              <div className="flex-1 text-center md:text-left">
                <div
                  className="text-xs font-medium tracking-wider mb-2"
                  style={{ color: 'rgba(57,27,27,0.6)' }}
                >
                  COMMUNITY
                </div>
                <h3
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#391B1B',
                    letterSpacing: '-0.02em',
                  }}
                >
                  내집 오픈카톡방에서 부동산 정보 공유해요
                </h3>
                <p
                  className="mt-2 text-sm"
                  style={{ color: 'rgba(57,27,27,0.75)', lineHeight: 1.6 }}
                >
                  실거래 소식·청약 정보·재건축 이야기를 함께 나누는 커뮤니티
                </p>
              </div>

              {/* CTA 버튼 */}
              <div
                className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all group-hover:scale-105"
                style={{
                  backgroundColor: '#391B1B',
                  color: '#FEE500',
                  fontSize: 15,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                }}
              >
                참여하기
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
