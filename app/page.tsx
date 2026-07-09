import Link from 'next/link';
import { Space_Grotesk } from 'next/font/google';
import {
  BarChart3, TrendingUp, CalendarDays, Target, MapPin, FileText,
} from 'lucide-react';
import HeroLive from '@/components/landing/HeroLive';
import MarketLive from '@/components/landing/MarketLive';
import MobileNav from '@/components/landing/MobileNav';
import { toSubscription } from '@/lib/adapters';
import { fetchSubscriptions } from '@/lib/subscription-api';
import { getTopLocations } from '@/lib/region-data';

/**
 * 메인 랜딩 — 디자인 개편 (Claude Design 캔버스 시안 기준).
 * 브랜드 #1B4DDB · Pretendard/Space Grotesk. 정적 섹션은 서버 렌더(SEO),
 * 히어로 지역탭 인터랙션만 클라 아일랜드(HeroLive). 청약은 실데이터 연동.
 */

const sg = Space_Grotesk({ subsets: ['latin'], weight: ['400', '600', '700'], variable: '--font-sg', display: 'swap' });

const BLUE = '#1B4DDB';
const INK = '#0B1524';
const INK2 = '#2B333F';
const NAV = '#3A4453';
const BODY = '#5B6472';
const MUTED = '#8A93A3';
const MUTED2 = '#98A1B0';
const BORDER = '#E7EAF0';

const NAV_LINKS = [
  { label: '부동산 분석', href: '/region' },
  { label: '청약', href: '/subscription' },
  { label: '내집마련 도구', href: '/loan' },
  { label: '시장 동향', href: '/market' },
  { label: '칼럼', href: '/blog' },
  { label: '뉴스', href: '/news' },
];

const SHORTCUTS = [
  { title: '실거래 조회', sub: '국토부 공개 실거래가', href: '/transactions', Icon: BarChart3 },
  { title: '변동률 지도', sub: '지역별 시세 변화율', href: '/price-map', Icon: TrendingUp },
  { title: '청약 정보', sub: '수도권 청약 일정', href: '/subscription', Icon: CalendarDays },
  { title: '입지 분석', sub: 'LOCATION SCORE', href: '/region', Icon: Target },
  { title: '부동산 지도', sub: '단지·매물 지도', href: '/location-map', Icon: MapPin },
  { title: '내집마련 도구', sub: '청약가점·대출 계산', href: '/loan', Icon: FileText },
];

// 국평 시세(수도권 6구 84㎡)는 MarketLive 클라이언트 컴포넌트에서 라이브 집계.

// 입지 TOP5 — 실데이터(location-scores.json). 원점수 1.0(최상)~5.0 → 0~100 표시 스케일 변환.
const TOP_LOCATIONS = getTopLocations(5).map((t) => ({
  rank: t.rank,
  region: t.name,
  score: Math.max(0, Math.min(100, Math.round(((5 - t.score) / 4) * 100))),
}));

const STEPS = [
  { n: '01', title: '지역을 고르세요', body: '관심 지역과 단지를 선택하면 최근 실거래가가 바로 흐릅니다.' },
  { n: '02', title: '공식 데이터를 확인하세요', body: '국토부·한국부동산원 실거래·시세를 가공 없이 그대로 봅니다.' },
  { n: '03', title: '비교하고 결정하세요', body: '입지점수·변동률로 여러 지역을 한눈에 비교하고 판단합니다.' },
];

interface Sub { status: string; name: string; loc: string; period: string; units: number }
const SAMPLE_SUBS: Sub[] = [
  { status: '청약 중', name: '대방역 여의도 더로드캐슬(4차)', loc: '서울 영등포구 신길동', period: '07.08 – 07.13', units: 5 },
  { status: '청약 예정', name: '거제 푸르지오 마린피스', loc: '경남 거제시 장평동', period: '07.20 – 07.22', units: 423 },
  { status: '청약 예정', name: '센텀 엘카사', loc: '울산 울주군 온양읍', period: '07.13 – 07.15', units: 74 },
];

const eyebrow: React.CSSProperties = {
  fontFamily: 'var(--font-sg, ui-monospace, monospace)',
  fontSize: 12, fontWeight: 600, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: MUTED2,
};
const sectionPad: React.CSSProperties = { maxWidth: 1200, margin: '0 auto', padding: '58px 24px' };

function statusChip(status: string) {
  if (status === '청약 중') return { text: '#0A7D4B', bg: '#E4F6EC', dot: '#12B76A' };
  if (status === '청약 예정') return { text: '#8A6D1F', bg: '#FBF1D9', dot: '#D9A93B' };
  return { text: '#5B6472', bg: '#EEF0F5', dot: '#98A1B0' };
}

export default async function HomePage() {
  const allItems = await fetchSubscriptions().catch(() => []);
  const real = allItems
    .filter((i) => i.status === 'ongoing' || i.status === 'upcoming')
    .slice(0, 3)
    .map(toSubscription) as unknown as Sub[];
  const subs: Sub[] = real.length ? real : SAMPLE_SUBS;

  return (
    <main className={sg.variable} style={{ fontFamily: 'Pretendard, system-ui, sans-serif', background: '#FFFFFF', color: INK, overflowX: 'hidden' }}>
      <style>{`.naezip-mobilenav{display:none}@media (max-width:720px){.naezip-navlinks,.naezip-login{display:none}.naezip-mobilenav{display:block}}`}</style>
      {/* ── 내비 ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #EEF0F5',
      }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '16px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <span style={{
              width: 30, height: 30, borderRadius: 9, background: BLUE,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ width: 11, height: 11, background: '#FFFFFF', transform: 'rotate(45deg)', borderRadius: 2 }} />
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: INK }}>내집</span>
            <span style={{ fontFamily: 'var(--font-sg)', fontSize: 13, fontWeight: 600, color: MUTED2, letterSpacing: '0.04em' }}>My.ZIP</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 26 }} className="naezip-navlinks">
            {NAV_LINKS.map((l) => (
              <Link key={l.href + l.label} href={l.href} style={{ fontSize: 14.5, fontWeight: 500, color: NAV, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                {l.label}
              </Link>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Link href="/admin/login" style={{ fontSize: 14, color: BODY, textDecoration: 'none' }} className="naezip-login">로그인</Link>
            <Link href="/region" style={{
              padding: '9px 16px', borderRadius: 10, background: BLUE, color: '#FFFFFF',
              fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
            }}>
              지역 둘러보기
            </Link>
            <MobileNav />
          </div>
        </div>
      </nav>

      {/* ── 히어로 (클라 아일랜드) ── */}
      <HeroLive />

      {/* ── 바로가기 ── */}
      <section style={{ background: '#FFFFFF' }}>
        <div style={sectionPad}>
          <span style={eyebrow}>SHORTCUTS</span>
          <h2 style={{ margin: '8px 0 24px', fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', color: INK }}>바로가기</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {SHORTCUTS.map(({ title, sub, href, Icon }) => (
              <Link key={title} href={href} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: 18,
                border: `1px solid ${BORDER}`, borderRadius: 16, textDecoration: 'none', background: '#FFFFFF',
              }}>
                <span style={{
                  width: 44, height: 44, borderRadius: 12, background: '#EEF2FE', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={20} color={BLUE} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: INK }}>{title}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginTop: 2 }}>{sub}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 국평 시세 + 입지 TOP5 ── */}
      <section style={{ background: '#F7F8FB', borderTop: '1px solid #EEF0F5' }}>
        <div style={{ ...sectionPad, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 28 }}>
          {/* 국평 실거래가 — 라이브 집계 */}
          <MarketLive />

          {/* 입지 TOP5 (다크) */}
          <div style={{ background: 'linear-gradient(160deg, #12224E, #1B3B8A)', borderRadius: 20, padding: 24, color: '#FFFFFF' }}>
            <span style={{ ...eyebrow, color: '#9DB6F5' }}>LOCATION SCORE · TOP 5</span>
            <h3 style={{ margin: '8px 0 18px', fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>이달의 최우수 입지</h3>
            {TOP_LOCATIONS.map((t) => (
              <div key={t.region} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0' }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.14)', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-sg)', fontSize: 12, fontWeight: 700,
                }}>{t.rank}</span>
                <span style={{ fontSize: 14, fontWeight: 600, width: 68, flexShrink: 0 }}>{t.region}</span>
                <span style={{ flex: 1, height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', minWidth: 0 }}>
                  <span style={{ display: 'block', height: '100%', width: `${t.score}%`, borderRadius: 99, background: 'linear-gradient(90deg, #6E9BFF, #A9C2FF)' }} />
                </span>
                <span style={{ fontFamily: 'var(--font-sg)', fontSize: 14, fontWeight: 700, color: '#BFD0FF', width: 26, textAlign: 'right', flexShrink: 0 }}>{t.score}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 청약 (실데이터) ── */}
      <section style={{ background: '#FFFFFF' }}>
        <div style={sectionPad}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
            <div>
              <span style={eyebrow}>SUBSCRIPTION</span>
              <h2 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', color: INK }}>수도권 주요 청약 일정</h2>
            </div>
            <Link href="/subscription" style={{ fontSize: 14, fontWeight: 700, color: BLUE, textDecoration: 'none', whiteSpace: 'nowrap' }}>전체 일정 보기 →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {subs.map((s, i) => {
              const c = statusChip(s.status);
              return (
                <div key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, background: '#FFFFFF' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 11px', borderRadius: 999, background: c.bg, color: c.text,
                    fontSize: 12, fontWeight: 700,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: c.dot }} />
                    {s.status}
                  </span>
                  <h4 style={{ margin: '12px 0 4px', fontSize: 16.5, fontWeight: 700, color: INK, lineHeight: 1.4 }}>{s.name}</h4>
                  <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>{s.loc}</p>
                  <div style={{ display: 'flex', gap: 24, marginTop: 14, paddingTop: 14, borderTop: '1px solid #F1F3F7' }}>
                    <span>
                      <span style={{ display: 'block', fontSize: 11, color: MUTED2 }}>청약기간</span>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: INK2, marginTop: 3 }}>{s.period}</span>
                    </span>
                    <span>
                      <span style={{ display: 'block', fontSize: 11, color: MUTED2 }}>공급세대</span>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: INK2, marginTop: 3 }}>{s.units.toLocaleString()}세대</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 3단계 (다크 밴드) ── */}
      <section style={{ background: INK }}>
        <div style={sectionPad}>
          <span style={{ ...eyebrow, color: '#7E8AA6' }}>HOW IT WORKS</span>
          <h2 style={{ margin: '8px 0 24px', fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', color: '#FFFFFF' }}>3단계면 충분합니다</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 22 }}>
            {STEPS.map((st) => (
              <div key={st.n} style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 24 }}>
                <span style={{ fontFamily: 'var(--font-sg)', fontSize: 30, fontWeight: 700, color: '#5B7CE0' }}>{st.n}</span>
                <h4 style={{ margin: '10px 0 8px', fontSize: 17, fontWeight: 700, color: '#FFFFFF' }}>{st.title}</h4>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#AEB6C6' }}>{st.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 텔레그램 CTA (블루 밴드) ── */}
      <section style={{ background: BLUE }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '46px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ ...eyebrow, color: '#BFD0FF' }}>CHANNEL</span>
            <h2 style={{ margin: '8px 0 6px', fontSize: 23, fontWeight: 800, color: '#FFFFFF' }}>내집 텔레그램에서 부동산 정보를 가장 빠르게</h2>
            <p style={{ margin: 0, fontSize: 14, color: '#CBD8FF' }}>실거래 신고가 · 시장 분석 · 새 칼럼 소식</p>
          </div>
          <a
            href={process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL || 'https://t.me/realMyzip'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '14px 22px', borderRadius: 12, background: '#FFFFFF', color: BLUE,
              fontSize: 15, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            채널 참여하기 →
          </a>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer style={{ background: INK }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '30px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#6B7488' }}>© 2026 내집(My.ZIP) · 데이터: 국토교통부 · 한국부동산원 · NEIS</p>
          <div style={{ display: 'flex', gap: 18 }}>
            <Link href="/privacy" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>이용약관</Link>
            <Link href="/privacy" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>개인정보처리방침</Link>
            <Link href="/contact" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>문의하기</Link>
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 26px' }}>
          <p style={{ margin: 0, fontSize: 11.5, color: '#4E576B', lineHeight: 1.6 }}>
            ※ 내집(My.ZIP)의 데이터는 참고용이며, 투자·매수 결정은 본인의 재무 상황을 고려하고 전문가와 상담한 후 신중히 판단하시기 바랍니다.
          </p>
        </div>
      </footer>
    </main>
  );
}
