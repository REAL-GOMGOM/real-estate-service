import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { connection } from 'next/server';
import {
  BarChart3, TrendingUp, CalendarDays, Target, MapPin, FileText,
} from 'lucide-react';
import MarketLive from '@/components/landing/MarketLive';
import MobileNav from '@/components/landing/MobileNav';
import MobileTabBar from '@/components/landing/MobileTabBar';
import RecentDealsCard from '@/components/landing/RecentDealsCard';
import NotableDealsCard from '@/components/landing/NotableDealsCard';
import HomeCalculator from '@/components/landing/HomeCalculator';
import NewsCard from '@/components/landing/NewsCard';
import RealValueCard from '@/components/landing/RealValueCard';
import AddToHomeCta from '@/components/landing/AddToHomeCta';
import { toSubscription } from '@/lib/adapters';
import { fetchSubscriptions } from '@/lib/subscription-api';
import type { SubscriptionItem } from '@/lib/types';
import { getTopLocations } from '@/lib/region-data';
import { formatLocationScore, scoreToQualityPercent } from '@/lib/score-utils';
import { DISTRICT_CODE } from '@/lib/district-codes';
import HomeApartmentSearch from '@/components/search/HomeApartmentSearch';
import { createPageMetadata } from '@/lib/metadata';
import { TrackedTelegramLink } from '@/components/shared/TrackedTelegramLink';

export const metadata = createPageMetadata({
  title: '내집(My.ZIP) | 실거래가·입지분석·청약·내집마련 도구',
  description: '국토교통부 실거래가, 입지 분석, 청약 일정과 내집마련 도구를 한 곳에서 확인하세요.',
  path: '/',
});

/**
 * 메인 홈 — 대시보드형 리디자인 (2a 벤토 그리드 시안).
 *
 * 첫 행동(단지 검색 → 실거래 확인)을 선명하게 두고, 자주 쓰는 실거래·입지는
 * 바로 노출한다. 시장 분석·계산기는 필요할 때 펼치는 보조 영역으로 제공한다.
 * 정적 콘텐츠(청약·입지)는 서버 렌더(SEO), 라이브 카드는 클라 아일랜드.
 * 데이터 장애 시 임시값을 실제 정보처럼 노출하지 않고 명시적인 상태를 표시한다.
 */

const BLUE = '#1B4DDB';
const INK = '#0B1524';
const INK2 = '#2B333F';
const NAV = '#3A4453';
const MUTED = '#8A93A3';
const MUTED2 = '#98A1B0';
const BORDER = '#E7EAF0';

const NAV_LINKS = [
  { label: '부동산 분석', href: '/region' },
  { label: '청약', href: '/subscription' },
  { label: '내집마련 도구', href: '/loan' },
  { label: '시장 동향', href: '/market' },
  { label: '칼럼', href: '/blog' },
];

const SHORTCUTS = [
  { title: '실거래 조회', href: '/transactions', Icon: BarChart3 },
  { title: '변동률 지도', href: '/price-map', Icon: TrendingUp },
  { title: '청약 정보', href: '/subscription', Icon: CalendarDays },
  { title: '입지 분석', href: '/region', Icon: Target },
  { title: '부동산 지도', href: '/location-map', Icon: MapPin },
  { title: '내집마련 도구', href: '/loan', Icon: FileText },
];

// 입지 TOP5 — 공개 점수는 원척도 1.0(최상)~5.0, 막대만 별도 백분율로 변환.
const TOP_LOCATIONS = getTopLocations(5).map((t) => ({
  rank: t.rank,
  region: t.name,
  id: t.id, // 클릭 → /region/{id} 상세 이동 (2026-07-12)
  score: t.score,
  qualityPercent: scoreToQualityPercent(t.score),
}));

interface Sub { status: string; name: string; loc: string; period: string; units: number | null }
type DataStatus = 'ok' | 'partial' | 'degraded';

function statusChip(status: string) {
  if (status === '청약 중') return { text: '#0A7D4B', bg: '#E4F6EC', dot: '#12B76A' };
  if (status === '청약 예정') return { text: '#8A6D1F', bg: '#FBF1D9', dot: '#D9A93B' };
  return { text: '#5B6472', bg: '#EEF0F5', dot: '#98A1B0' };
}

/** 카드 공통 헤더 (제목 + 우측 링크) */
function CardHeader({ title, moreHref, moreLabel }: { title: string; moreHref?: string; moreLabel?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <span style={{ fontWeight: 800, fontSize: 15, color: INK, letterSpacing: '-0.01em' }}>{title}</span>
      {moreHref && (
        <Link href={moreHref} style={{ fontSize: 12.5, fontWeight: 600, color: BLUE, textDecoration: 'none', flexShrink: 0 }}>
          {moreLabel ?? '전체 →'}
        </Link>
      )}
    </div>
  );
}

async function SubscriptionScheduleCard() {
  // 외부 청약홈 API를 정적 빌드와 분리한다. API 장애는 홈 전체 장애가 아니라
  // 이 카드의 명시적인 unavailable 상태로만 제한한다.
  await connection();

  let subscriptionStatus: DataStatus = 'ok';
  let subscriptionNote: string | undefined;
  let allItems: SubscriptionItem[] = [];
  try {
    const result = await fetchSubscriptions();
    allItems = result.items;
    subscriptionStatus = result.status === 'unavailable'
      ? 'degraded'
      : result.status === 'partial'
        ? 'partial'
        : 'ok';
    subscriptionNote = result.note;
  } catch (error) {
    subscriptionStatus = 'degraded';
    console.error('[home] subscription feed unavailable', error);
  }
  const real = allItems
    .filter((i) => i.status === 'ongoing' || i.status === 'upcoming')
    .slice(0, 2)
    .map(toSubscription) as unknown as Sub[];
  const subs: Sub[] = real;

  return (
    <div style={{
      background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 18,
      padding: 20, display: 'flex', flexDirection: 'column',
    }}>
      <CardHeader title="주요 청약 일정" moreHref="/subscription" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {subscriptionStatus === 'partial' && (
          <div role="status" style={{ border: '1px solid #E9D39C', borderRadius: 12, padding: 12, background: '#FFF9EC' }}>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#71551C' }}>현재 수집된 일부 공고만 표시합니다.</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.5, color: MUTED }}>{subscriptionNote ?? '일부 청약홈 자료가 응답하지 않았습니다.'}</p>
          </div>
        )}
        {subscriptionStatus === 'degraded' ? (
          <div role="status" style={{ border: '1px solid #F2D7D5', borderRadius: 12, padding: 16, background: '#FFF8F7' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#8A2C25' }}>청약 데이터를 잠시 불러오지 못했습니다.</p>
            <p style={{ margin: '5px 0 0', fontSize: 11.5, lineHeight: 1.5, color: MUTED }}>잠시 후 전체 일정에서 다시 확인해 주세요.</p>
          </div>
        ) : subs.length === 0 ? (
          <div style={{ border: '1px dashed #D9DEE8', borderRadius: 12, padding: 16, background: '#FCFDFE' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK2 }}>현재 접수 중이거나 예정된 주요 청약이 없습니다.</p>
            <p style={{ margin: '5px 0 0', fontSize: 11.5, lineHeight: 1.5, color: MUTED }}>마감 공고를 포함한 전체 일정은 청약 페이지에서 확인할 수 있습니다.</p>
          </div>
        ) : (
          subs.map((s) => {
            const c = statusChip(s.status);
            return (
              <div key={`${s.name}-${s.period}`} style={{ border: '1px solid #EEF0F5', borderRadius: 12, padding: 13, background: '#FCFDFE' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 700, color: c.text, background: c.bg,
                    padding: '3px 9px', borderRadius: 999,
                  }}>
                    <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 999, background: c.dot }} />
                    {s.status}
                  </span>
                  <span style={{ fontSize: 11, color: MUTED2 }}>
                    {s.units !== null ? `${s.units.toLocaleString()}세대` : '세대수 미표기'}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.35 }}>{s.name}</div>
                {s.loc && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>{s.loc}</div>}
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{s.period}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SubscriptionScheduleFallback() {
  return (
    <div aria-busy="true" style={{
      background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 18,
      padding: 20, display: 'flex', flexDirection: 'column',
    }}>
      <CardHeader title="주요 청약 일정" moreHref="/subscription" />
      <div role="status" style={{ border: '1px solid #EEF0F5', borderRadius: 12, padding: 16, background: '#FCFDFE' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK2 }}>청약 일정을 불러오는 중입니다.</p>
      </div>
    </div>
  );
}

export default function HomePage() {

  return (
    <main className="nz-main" style={{ fontFamily: 'Pretendard, system-ui, sans-serif', background: '#FFFFFF', color: INK, overflowX: 'hidden' }}>
      <style>{`
        .nz-main{--font-sg:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
        .naezip-mobilenav{display:none}
        @media (max-width:720px){.naezip-navlinks,.naezip-login{display:none!important}.naezip-mobilenav{display:block!important}}
        @keyframes zipPulse{0%,100%{opacity:1}50%{opacity:.35}}
        .nz-band{display:grid;gap:16px;align-items:stretch}
        .nz-band>*{min-width:0}
        .nz-band1{grid-template-columns:repeat(3,minmax(0,1fr))}
        .nz-band2{grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) minmax(0,0.95fr)}
        .nz-band3{grid-template-columns:repeat(2,minmax(0,1fr))}
        @media (max-width:1080px){
          .nz-band1,.nz-band2,.nz-band3{grid-template-columns:minmax(0,1fr)}
          .nz-band2>*:first-child{order:2}
        }
        .nz-hero{display:flex;align-items:center;justify-content:space-between;gap:32px;flex-wrap:wrap}
        .nz-heroright{display:flex;flex-direction:column;align-items:stretch;gap:8px;width:400px;max-width:100%;flex-shrink:0}
        .nz-searchform{display:flex;align-items:center;gap:9px;width:100%;max-width:100%;padding:12px 16px;background:#fff;border:1px solid #DDE3EE;border-radius:12px}
        .nz-tools{border:1px solid #E1E5EC;border-radius:18px;background:#fff;overflow:hidden}
        .nz-tools-summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;cursor:pointer;list-style:none}
        .nz-tools-summary::-webkit-details-marker{display:none}
        .nz-tools-summary::after{content:'펼치기 +';font-size:12.5px;font-weight:700;color:#1B4DDB;white-space:nowrap}
        .nz-tools[open]>.nz-tools-summary::after{content:'접기 −'}
        .nz-tools[open]>.nz-tools-summary{border-bottom:1px solid #E7EAF0}
        .nz-tools-content{padding:16px;background:#F5F6FA}
        @media (max-width:860px){
          .nz-heroright{width:100%;align-items:stretch}
          .nz-searchform{width:100%}
        }
        .nz-chips{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none}
        .nz-chips::-webkit-scrollbar{display:none}
        .nz-chip{display:flex;align-items:center;gap:10px;padding:10px 16px;border:1px solid #E7EAF0;border-radius:11px;background:#fff;text-decoration:none;white-space:nowrap;flex-shrink:0;transition:.15s}
        .nz-chip:hover{border-color:#1B4DDB;background:#F7F9FE}
        .nz-chipicon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px}
        .nz-chiplabel{font-size:13.5px;font-weight:700;color:#0B1524}
        @media (max-width:720px){
          .nz-chip{flex-direction:column;gap:7px;width:64px;padding:0;border:none;background:transparent;white-space:normal}
          .nz-chip:hover{background:transparent}
          .nz-chipicon{width:48px;height:48px;border-radius:14px;background:#EEF2FE}
          .nz-chiplabel{font-size:10.5px;font-weight:600;color:#3A4453;text-align:center;line-height:1.2}
          .nz-main{padding-bottom:74px}
        }
      `}</style>

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
            {/* 기존 이미지 로고 사용 — 시안의 CSS 도형은 프로토타입 대체물 (README Assets 명시) */}
            <Image src="/logo.png" alt="내집(My.ZIP)" width={32} height={32} style={{ objectFit: 'contain', flexShrink: 0 }} priority />
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

      {/* ── 슬림 히어로 바 ── */}
      <section style={{ background: 'linear-gradient(180deg, #FBFCFE, #F4F7FC)', borderBottom: '1px solid #EEF0F5' }}>
        <div className="nz-hero" style={{ maxWidth: 1200, margin: '0 auto', padding: '26px 24px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#12B76A', animation: 'zipPulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: BLUE }}>국토부 공개 실거래 기반 · 데이터별 기준일 확인</span>
            </div>
            <h1 style={{
              margin: 0, fontSize: 'clamp(24px, 4vw, 30px)', lineHeight: 1.15,
              letterSpacing: '-0.03em', fontWeight: 800, color: INK,
            }}>
              우리 아파트, 얼마에 거래됐을까?
            </h1>
            <p style={{ margin: '11px 0 0', maxWidth: 520, fontSize: 14, lineHeight: 1.55, color: NAV }}>
              단지명을 검색하면 최근 실거래와 가격 흐름을 바로 확인할 수 있어요.
              {' '}전국 {Object.keys(DISTRICT_CODE).length}개 시군구를 지원합니다.
            </p>
          </div>

          <div className="nz-heroright">
            <span style={{ fontSize: 12.5, fontWeight: 700, color: INK2 }}>아파트 단지 검색</span>
            <HomeApartmentSearch />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: MUTED }}>검색 결과를 고르면 실거래로 이동해요.</span>
              <Link href="/region" style={{ color: BLUE, fontWeight: 700, fontSize: 12.5, textDecoration: 'none' }}>
                단지를 모르면 지역으로 찾기 →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 퀵 액션 칩 ── */}
      <section style={{ background: '#FFFFFF', borderBottom: '1px solid #EEF0F5' }}>
        <div className="nz-chips" style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 24px' }}>
          {SHORTCUTS.map(({ title, href, Icon }) => (
            <Link key={title} href={href} className="nz-chip">
              <span className="nz-chipicon"><Icon size={20} color={BLUE} /></span>
              <span className="nz-chiplabel">{title}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 벤토 그리드 ── */}
      <section style={{ background: '#F5F6FA' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 24px 30px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: INK }}>지금 확인할 정보</h2>
            <p style={{ margin: '5px 0 0', fontSize: 12.5, color: MUTED }}>최근 실거래와 특이 거래를 먼저 확인하세요.</p>
          </div>

          {/* 밴드 1 — 최근 실거래 · 특이 실거래 · 입지 TOP5 */}
          <div className="nz-band nz-band1">
            <RecentDealsCard />
            <NotableDealsCard />

            <div style={{
              background: 'linear-gradient(160deg, #12224E, #1B3B8A)', borderRadius: 18,
              padding: 22, color: '#FFFFFF', display: 'flex', flexDirection: 'column',
            }}>
              <span style={{
                fontFamily: 'var(--font-sg, ui-monospace, monospace)',
                fontSize: 11, letterSpacing: '0.1em', color: '#9DB6F5', fontWeight: 600,
              }}>
                LOCATION SCORE · 1.00–5.00
              </span>
              <h3 style={{ margin: '7px 0 16px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
                등록 지역 자체점수 상위
              </h3>
              <p style={{ margin: '-10px 0 14px', fontSize: 11.5, color: '#9DB6F5' }}>
                원점수 기준 · 낮을수록 우수
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, justifyContent: 'center' }}>
                {TOP_LOCATIONS.map((t) => (
                  /* 행 전체 클릭 → 지역 상세 이동 (2026-07-12) */
                  <Link key={t.region} href={`/region/${t.id}`} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{
                          width: 19, height: 19, borderRadius: 6, background: 'rgba(255,255,255,0.14)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: 'var(--font-sg)', fontSize: 10.5, fontWeight: 700,
                        }}>{t.rank}</span>
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{t.region}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-sg)', fontWeight: 700, fontSize: 13, color: '#BFD0FF' }}>{formatLocationScore(t.score)} →</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${t.qualityPercent}%`, borderRadius: 99, background: 'linear-gradient(90deg, #6E9BFF, #A9C2FF)' }} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* 보조 도구 — 긴 홈에서 필요한 사용자만 펼쳐 확인 */}
          <details className="nz-tools">
            <summary className="nz-tools-summary">
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong style={{ fontSize: 15, color: INK }}>시장 분석·계산기</strong>
                <span style={{ fontSize: 12, color: MUTED }}>국평 시세 · 내집마련 계산 · 실질 가치</span>
              </span>
            </summary>
            <div className="nz-band nz-band2 nz-tools-content">
              <MarketLive />
              <HomeCalculator />
              <RealValueCard />
            </div>
          </details>

          {/* 밴드 3 — 청약 · 뉴스 (빈 칼럼 카드는 홈에서 제외) */}
          <div className="nz-band nz-band3">
            {/* 청약 일정 */}
            <Suspense fallback={<SubscriptionScheduleFallback />}>
              <SubscriptionScheduleCard />
            </Suspense>

            {/* 오늘의 뉴스 */}
            <NewsCard />
          </div>
        </div>
      </section>

      {/* ── 홈 화면 바로가기 CTA (2026-07-12) — 미지원·이미 설치 시 자동 숨김 ── */}
      <AddToHomeCta />

      {/* ── 텔레그램 CTA ── */}
      <section style={{ background: BLUE }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '32px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              내집 텔레그램에서 주요 부동산 소식 받아보기
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#CBD8FF' }}>실거래 신고가 · 시장 분석 · 새 칼럼 소식</p>
          </div>
          <TrackedTelegramLink
            href={process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL || 'https://t.me/realMyzip'}
            placement="home_footer_cta"
            style={{
              padding: '13px 24px', borderRadius: 12, background: '#FFFFFF', color: BLUE,
              fontSize: 14.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            채널 참여하기 →
          </TrackedTelegramLink>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer style={{ background: INK }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '24px 24px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#6B7488' }}>© 2026 내집(My.ZIP) · 데이터: 국토교통부 · 한국부동산원 · 학교알리미</p>
          <div style={{ display: 'flex', gap: 18 }}>
            <Link href="/terms" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>이용약관</Link>
            <Link href="/privacy" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>개인정보처리방침</Link>
            <Link href="/contact" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>문의하기</Link>
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 24px 26px' }}>
          <p style={{ margin: 0, fontSize: 11.5, color: '#4E576B', lineHeight: 1.6 }}>
            ※ 내집(My.ZIP)의 데이터는 참고용이며, 투자·매수 결정은 본인의 재무 상황을 고려하고 전문가와 상담한 후 신중히 판단하시기 바랍니다.
          </p>
        </div>
      </footer>

      {/* 모바일 하단 탭바 */}
      <MobileTabBar />
    </main>
  );
}
