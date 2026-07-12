import Link from 'next/link';
import Image from 'next/image';
import { cacheLife } from 'next/cache';
import { Space_Grotesk } from 'next/font/google';
import {
  BarChart3, TrendingUp, CalendarDays, Target, MapPin, FileText, Search,
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
import { getTopLocations } from '@/lib/region-data';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { getRecentPublishedPostsForFeed, type FeedItem } from '@/lib/blog/queries';

/**
 * 메인 홈 — 대시보드형 리디자인 (2a 벤토 그리드 시안).
 *
 * 세로 랜딩 → 첫 화면 압축형 대시보드: 슬림 히어로 바 + 퀵액션 칩 + 벤토 3밴드
 * (실거래·특이거래·입지 / 국평 시세·계산기 / 청약·칼럼·뉴스).
 * 정적 콘텐츠(청약·칼럼·입지)는 서버 렌더(SEO), 라이브 카드는 클라 아일랜드
 * (표본 즉시 표시 → API 도착 시 교체 패턴).
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
  { title: '실거래 조회', href: '/transactions', Icon: BarChart3 },
  { title: '변동률 지도', href: '/price-map', Icon: TrendingUp },
  { title: '청약 정보', href: '/subscription', Icon: CalendarDays },
  { title: '입지 분석', href: '/region', Icon: Target },
  { title: '부동산 지도', href: '/location-map', Icon: MapPin },
  { title: '내집마련 도구', href: '/loan', Icon: FileText },
];

// 입지 TOP5 — 실데이터(location-scores.json). 원점수 1.0(최상)~5.0 → 0~100 표시 스케일 변환.
const TOP_LOCATIONS = getTopLocations(5).map((t) => ({
  rank: t.rank,
  region: t.name,
  id: t.id, // 클릭 → /region/{id} 상세 이동 (2026-07-12)
  score: Math.max(0, Math.min(100, Math.round(((5 - t.score) / 4) * 100))),
}));

// 히어로 스탯 — 시안의 마케팅 수치 대신 실데이터 기반 (커버리지는 등록 시군구 수 자동 집계)
const HERO_STATS = [
  { value: `${Object.keys(DISTRICT_CODE).length}개 시군구`, label: '실거래 데이터 커버리지' },
  { value: '매일 09:00', label: '국토부 데이터 갱신' },
  { value: '84㎡ 국평', label: '구별 시세 라이브 집계' },
];

interface Sub { status: string; name: string; loc: string; period: string; units: number }
const SAMPLE_SUBS: Sub[] = [
  { status: '청약 중', name: '대방역 여의도 더로드캐슬(4차)', loc: '서울 영등포구 신길동', period: '07.08 – 07.13', units: 5 },
  { status: '청약 예정', name: '거제 푸르지오 마린피스', loc: '경남 거제시 장평동', period: '07.20 – 07.22', units: 423 },
  { status: '청약 예정', name: '센텀 엘카사', loc: '울산 울주군 온양읍', period: '07.13 – 07.15', units: 74 },
];

// 칼럼 카드 표본 — DB 조회 실패/빈 결과 시에만 사용 (목록 페이지로만 링크)
const SAMPLE_FEATURED = { category: '시장 분석', date: '07.09', title: '금리 인하기, 강남 국평은 왜 먼저 움직이나', href: '/blog' };
const SAMPLE_COLUMNS = [
  { category: '청약 전략', title: '무순위 줍줍, 지금 넣어도 될까? 체크리스트 5', href: '/blog' },
  { category: '입지 분석', title: 'GTX-A 개통 1년, 실거래로 본 진짜 수혜지', href: '/blog' },
  { category: '내집마련', title: 'DSR 3단계 시대, 대출 한도 이렇게 바뀐다', href: '/blog' },
  { category: '시장 동향', title: '전세가율 70% 돌파 지역, 갭투자 주의보', href: '/blog' },
];

function statusChip(status: string) {
  if (status === '청약 중') return { text: '#0A7D4B', bg: '#E4F6EC', dot: '#12B76A' };
  if (status === '청약 예정') return { text: '#8A6D1F', bg: '#FBF1D9', dot: '#D9A93B' };
  return { text: '#5B6472', bg: '#EEF0F5', dot: '#98A1B0' };
}

function fmtPostDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 칼럼 피드 — 캐시 경계.
 * Cache Components 에서 비캐시 DB 접근은 프리렌더 오류가 되므로
 * subscription-api 와 동일하게 'use cache' + cacheLife 로 감싼다.
 * 실패 시 빈 배열 → 호출부에서 표본 폴백.
 */
async function getLandingFeed(): Promise<FeedItem[]> {
  'use cache';
  cacheLife('hours');
  try {
    return await getRecentPublishedPostsForFeed(5);
  } catch {
    return [];
  }
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

export default async function HomePage() {
  // 청약 — 실데이터 (실패 시 표본)
  const allItems = await fetchSubscriptions().catch(() => []);
  const real = allItems
    .filter((i) => i.status === 'ongoing' || i.status === 'upcoming')
    .slice(0, 3)
    .map(toSubscription) as unknown as Sub[];
  const subs: Sub[] = real.length ? real : SAMPLE_SUBS;

  // 칼럼 — 최근 발행 5건 (캐시 경계 통과, 실패 시 표본)
  const feed = await getLandingFeed();
  const featured = feed[0]
    ? {
        category: feed[0].categoryName ?? '칼럼',
        date: fmtPostDate(feed[0].publishedAt),
        title: feed[0].title,
        href: `/blog/${encodeURIComponent(feed[0].slug)}`,
      }
    : SAMPLE_FEATURED;
  const columns = feed.length > 1
    ? feed.slice(1, 5).map((p) => ({
        category: p.categoryName ?? '칼럼',
        title: p.title,
        href: `/blog/${encodeURIComponent(p.slug)}`,
      }))
    : SAMPLE_COLUMNS;

  return (
    <main className={`${sg.variable} nz-main`} style={{ fontFamily: 'Pretendard, system-ui, sans-serif', background: '#FFFFFF', color: INK, overflowX: 'hidden' }}>
      <style>{`
        .naezip-mobilenav{display:none}
        @media (max-width:720px){.naezip-navlinks,.naezip-login{display:none!important}.naezip-mobilenav{display:block!important}}
        @keyframes zipPulse{0%,100%{opacity:1}50%{opacity:.35}}
        .nz-band{display:grid;gap:16px;align-items:stretch}
        .nz-band>*{min-width:0}
        .nz-band1{grid-template-columns:repeat(3,minmax(0,1fr))}
        .nz-band2{grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) minmax(0,0.95fr)}
        .nz-band3{grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) minmax(0,1fr)}
        @media (max-width:1080px){
          .nz-band1,.nz-band2,.nz-band3{grid-template-columns:minmax(0,1fr)}
          .nz-band2>*:first-child{order:2}
        }
        .nz-hero{display:flex;align-items:center;justify-content:space-between;gap:32px;flex-wrap:wrap}
        .nz-heroright{display:flex;flex-direction:column;align-items:flex-end;gap:12px;flex-shrink:0}
        .nz-searchform{display:flex;align-items:center;gap:9px;width:340px;max-width:100%;padding:12px 16px;background:#fff;border:1px solid #DDE3EE;border-radius:12px}
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

      {/* ── 슬림 히어로 바 ── */}
      <section style={{ background: 'linear-gradient(180deg, #FBFCFE, #F4F7FC)', borderBottom: '1px solid #EEF0F5' }}>
        <div className="nz-hero" style={{ maxWidth: 1200, margin: '0 auto', padding: '26px 24px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#12B76A', animation: 'zipPulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: BLUE }}>실거래 데이터 매일 09:00 갱신 · 국토부 공개</span>
            </div>
            <h1 style={{
              margin: 0, fontSize: 'clamp(24px, 4vw, 30px)', lineHeight: 1.15,
              letterSpacing: '-0.03em', fontWeight: 800, color: INK,
            }}>
              부동산의 모든 답을, 한 곳에 압축하다
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
              {HERO_STATS.map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span style={{ fontFamily: 'var(--font-sg)', fontSize: 15, fontWeight: 700, color: INK }}>{s.value}</span>
                  <span style={{ fontSize: 12, color: MUTED }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="nz-heroright">
            <form action="/transactions" className="nz-searchform">
              <Search size={18} color={MUTED2} style={{ flexShrink: 0 }} />
              <input
                type="text"
                name="q"
                placeholder="단지·지역 검색"
                aria-label="단지·지역 검색"
                style={{
                  border: 'none', outline: 'none', fontFamily: 'inherit',
                  fontSize: 14, color: INK, width: '100%', background: 'transparent',
                }}
              />
            </form>
            <Link href="/region" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: BLUE, color: '#FFFFFF', fontWeight: 700, fontSize: 14.5,
              padding: '12px 22px', borderRadius: 12, textDecoration: 'none',
            }}>
              지역 둘러보기 →
            </Link>
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
                LOCATION SCORE · TOP 5
              </span>
              <h3 style={{ margin: '7px 0 16px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
                이달의 최우수 입지
              </h3>
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
                      <span style={{ fontFamily: 'var(--font-sg)', fontWeight: 700, fontSize: 13, color: '#BFD0FF' }}>{t.score} →</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${t.score}%`, borderRadius: 99, background: 'linear-gradient(90deg, #6E9BFF, #A9C2FF)' }} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* 밴드 2 — 국평 시세 · 내집마련 계산기 · 실질 가치 (2026-07-12 추가) */}
          <div className="nz-band nz-band2">
            <MarketLive />
            <HomeCalculator />
            <RealValueCard />
          </div>

          {/* 밴드 3 — 청약 · 칼럼 · 뉴스 */}
          <div className="nz-band nz-band3">
            {/* 청약 일정 */}
            <div style={{
              background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 18,
              padding: 20, display: 'flex', flexDirection: 'column',
            }}>
              <CardHeader title="주요 청약 일정" moreHref="/subscription" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                {subs.map((s, i) => {
                  const c = statusChip(s.status);
                  return (
                    <div key={i} style={{ border: '1px solid #EEF0F5', borderRadius: 12, padding: 13, background: '#FCFDFE' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 11, fontWeight: 700, color: c.text, background: c.bg,
                          padding: '3px 9px', borderRadius: 999,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: 999, background: c.dot }} />
                          {s.status}
                        </span>
                        <span style={{ fontSize: 11, color: MUTED2 }}>{s.units.toLocaleString()}세대</span>
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.35 }}>{s.name}</div>
                      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>{s.period}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 부동산 인사이트 (칼럼) */}
            <div style={{
              background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 18,
              padding: 20, display: 'flex', flexDirection: 'column',
            }}>
              <CardHeader title="부동산 인사이트" moreHref="/blog" moreLabel="칼럼 전체 →" />
              <Link href={featured.href} style={{
                display: 'flex', gap: 14, paddingBottom: 14, borderBottom: '1px solid #F1F3F7',
                marginBottom: 12, textDecoration: 'none',
              }}>
                {/* 칼럼 목록(PostCard)과 동일한 OG 룩 미니 썸네일 — 빗금 자리표시자 대체 (2026-07-12).
                    제목은 바로 옆에 있으므로 썸네일 안에는 카테고리 필+브랜드만. */}
                <span style={{
                  width: 120, height: 78, flexShrink: 0, borderRadius: 11, overflow: 'hidden',
                  background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  padding: '7px 9px',
                }}>
                  <span style={{
                    alignSelf: 'flex-start', fontSize: 8.5, fontWeight: 700, color: '#FFFFFF',
                    background: '#0f172a', padding: '2px 7px', borderRadius: 99,
                    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {featured.category}
                  </span>
                  <span style={{ alignSelf: 'flex-end', fontSize: 8.5, fontWeight: 800, color: '#0f172a' }}>
                    내집(My.ZIP)
                  </span>
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: BLUE, background: '#EEF2FE', padding: '3px 8px', borderRadius: 6 }}>
                      {featured.category}
                    </span>
                    <span style={{ fontSize: 11, color: MUTED2 }}>{featured.date}</span>
                  </span>
                  <span style={{
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    fontSize: 15, fontWeight: 800, color: INK, lineHeight: 1.32, letterSpacing: '-0.01em',
                  }}>
                    {featured.title}
                  </span>
                </span>
              </Link>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {columns.map((c, i) => (
                  <Link key={i} href={c.href} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: BLUE, flexShrink: 0, width: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.category}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: INK2, lineHeight: 1.35,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {c.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

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
              내집 텔레그램에서 부동산 정보를 가장 빠르게
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#CBD8FF' }}>실거래 신고가 · 시장 분석 · 새 칼럼 소식</p>
          </div>
          <a
            href={process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL || 'https://t.me/realMyzip'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '13px 24px', borderRadius: 12, background: '#FFFFFF', color: BLUE,
              fontSize: 14.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            채널 참여하기 →
          </a>
        </div>
      </section>

      {/* ── 푸터 ── */}
      <footer style={{ background: INK }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', padding: '24px 24px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <p style={{ margin: 0, fontSize: 12.5, color: '#6B7488' }}>© 2026 내집(My.ZIP) · 데이터: 국토교통부 · 한국부동산원 · NEIS</p>
          <div style={{ display: 'flex', gap: 18 }}>
            <Link href="/privacy" style={{ fontSize: 13, color: MUTED, textDecoration: 'none' }}>이용약관</Link>
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
