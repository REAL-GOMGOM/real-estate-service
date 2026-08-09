import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/site';
import { TrackedTelegramLink } from '@/components/shared/TrackedTelegramLink';

/**
 * 텔레그램 채널 경유 랜딩 — /telegram (2026-07-12)
 *
 * 배경: 카카오톡이 t.me 도메인 전반에 "신고가 급증한 URL" 경고를 붙여
 * 채널 링크 공유가 사실상 차단됨. 카톡·SNS에는 이 자체 도메인 페이지만
 * 공유하고, 여기서 버튼으로 채널에 진입시킨다.
 * (즉시 redirect 로 만들면 카카오 크롤러가 최종 t.me 를 따라가 경고가
 *  붙을 수 있어 의도적으로 버튼 랜딩으로 구성)
 */

const CHANNEL_URL = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL || 'https://t.me/realMyzip';

export const metadata: Metadata = {
  title: '내집 텔레그램 채널 — 실거래 신고가·시장 분석 알림',
  description: '주요 실거래 다이제스트, 신고가 알림, 새 칼럼 소식을 선별해 전하는 내집(My.ZIP) 공식 텔레그램 채널입니다.',
  alternates: { canonical: `${SITE_URL}/telegram` },
  robots: { index: false, follow: true },
  openGraph: {
    title: '내집 텔레그램 채널',
    description: '실거래 신고가 · 시장 분석 · 새 칼럼 소식을 선별해 전달합니다',
    url: `${SITE_URL}/telegram`,
    siteName: '내집(My.ZIP)',
    locale: 'ko_KR',
    type: 'website',
    // 카톡 미리보기 이미지 — 이 페이지의 존재 이유가 카톡 공유라 필수
    images: [{ url: `${SITE_URL}/logo.png`, width: 360, height: 360, alt: '내집(My.ZIP)' }],
  },
};

const PERKS = [
  { icon: '🌅', title: '실거래 다이제스트', desc: '공개 신고분 중 수도권과 지방의 주요 거래를 선별' },
  { icon: '🔥', title: '신고가 알림', desc: '주요 단지의 신고가 경신 소식' },
  { icon: '📰', title: '뉴스 브리핑', desc: '주요 부동산 뉴스를 짧게 요약' },
  { icon: '📝', title: '새 칼럼 소식', desc: '새 정책 분석과 지역 리포트 안내' },
];

export default function TelegramLandingPage() {
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(180deg, #FFFFFF 0%, #F3F6FC 100%)', padding: '40px 20px',
    }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        {/* 브랜드 */}
        <Image src="/logo.png" alt="내집(My.ZIP)" width={72} height={72} style={{ objectFit: 'contain', margin: '0 auto' }} priority />
        <h1 style={{ margin: '16px 0 6px', fontSize: 24, fontWeight: 800, color: '#0B1524', letterSpacing: '-0.02em' }}>
          내집 텔레그램 채널
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: '#5B6472', lineHeight: 1.6 }}>
          실거래 신고가 · 시장 분석 · 새 칼럼 소식을<br />운영 일정에 따라 선별해 받아보세요
        </p>

        {/* 혜택 */}
        <div style={{
          margin: '28px 0', padding: '6px 20px', borderRadius: 16,
          background: '#FFFFFF', border: '1px solid #E7EAF0', textAlign: 'left',
        }}>
          {PERKS.map((p, i) => (
            <div key={p.title} style={{
              display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 0',
              borderBottom: i < PERKS.length - 1 ? '1px solid #F1F3F7' : 'none',
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{p.icon}</span>
              <span>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#0B1524' }}>{p.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: '#64708A', marginTop: 2 }}>{p.desc}</span>
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <TrackedTelegramLink
          href={CHANNEL_URL}
          placement="telegram_landing_cta"
          style={{
            display: 'block', padding: '15px 0', borderRadius: 13,
            background: '#1B4DDB', color: '#FFFFFF', fontSize: 15.5, fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          텔레그램에서 채널 열기 →
        </TrackedTelegramLink>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#98A1B0' }}>
          내집 텔레그램 채널 · 구독 무료
        </p>

        <p style={{ marginTop: 28 }}>
          <Link href="/" style={{ fontSize: 13, color: '#64708A', textDecoration: 'none' }}>
            ← 내집(My.ZIP) 홈으로
          </Link>
        </p>
      </div>
    </main>
  );
}
