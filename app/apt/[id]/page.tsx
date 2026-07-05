import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import PriceComboChart from '@/components/apt/PriceComboChart';
import { AnalysisPromoBar } from '@/components/shared/AnalysisPromoBar';
import { getApartmentById, getAptPageData, APT_PAGE_MONTHS } from '@/lib/apt-detail';
import {
  fmtPrice, fmtPriceFull, fmtContractDate, detectNewHigh, peakRecovery,
} from '@/lib/tx-shared';
import { SITE_URL } from '@/lib/site';
import AptShareActions from './AptShareActions';

/**
 * 단지 전용 페이지 — 사이클 DD (SEO 유입 엔진).
 *
 * /apt/[id] (id = 단지 마스터 kaptCode). 거래 이력·통계를 서버 HTML 로
 * 렌더해 "단지명 + 실거래" 검색을 페이지 단위로 받는다.
 * MOLIT fetch 캐시(24h)를 API 와 공유 — 부하 추가 없음.
 */

const TABLE_LIMIT = 30;

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  // await params 가 첫 동적 접근이어야 PPR 셸 프리렌더가 여기서 안전하게
  // 지연된다 (blog/[slug] 패턴). connection() 을 먼저 호출하면 빌드 에러.
  const { id } = await params;
  const apt = await getApartmentById(decodeURIComponent(id));
  if (!apt) return { title: '단지를 찾을 수 없습니다 | 내집 My.ZIP' };

  const title = `${apt.name} 실거래가·시세 | 내집 My.ZIP`;
  const description =
    `${apt.sigungu}${apt.dong ? ` ${apt.dong}` : ''} ${apt.name} 아파트 실거래가와 최근 3년 시세 차트, ` +
    `전고점 회복률, 면적별 거래 내역${apt.totalHouseholds ? ` (${apt.totalHouseholds.toLocaleString()}세대)` : ''}. ` +
    `국토교통부 실거래가 기반.`;
  const canonical = `${SITE_URL}/apt/${encodeURIComponent(apt.id)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: '내집(My.ZIP)', locale: 'ko_KR', type: 'website' },
  };
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: '12px',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border)',
    }}>
      <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px' }}>{label}</p>
      <p style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{value}</p>
      {sub && <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '3px' }}>{sub}</p>}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontSize: '11px', fontWeight: 700,
  color: 'var(--text-strong)', textAlign: 'left', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '11px 12px', fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap',
};

async function AptContent({ params }: { params: Promise<{ id: string }> }) {
  // 요청 시 렌더 선언 — 로더가 new Date(월 목록) 를 쓰므로 PPR 프리렌더에서 제외
  await connection();

  const { id } = await params;
  const data = await getAptPageData(decodeURIComponent(id));
  if (!data) notFound();

  const { master, district, group } = data;
  const sorted   = group.transactions; // 로더가 최신순 정렬
  const latest   = sorted[0];
  const avg      = sorted.length
    ? Math.round(sorted.reduce((s, t) => s + t.price, 0) / sorted.length) : 0;
  const maxTx    = sorted.reduce<typeof latest | null>((m, t) => (!m || t.price > m.price ? t : m), null);
  const maxPrice = maxTx?.price ?? 0;
  const newHigh  = detectNewHigh(group);
  const recovery = peakRecovery(group);

  const deepLink = `/transactions?district=${encodeURIComponent(district)}&q=${encodeURIComponent(group.name)}`;

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '40px 24px 56px' }}>
      {/* 브레드크럼 + 헤더 */}
      <nav style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '14px' }} aria-label="breadcrumb">
        <Link href="/transactions" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>실거래 조회</Link>
        {' · '}
        <Link href={deepLink.split('&q=')[0]} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>{district}</Link>
        {' · '}
        <span style={{ color: 'var(--text-muted)' }}>{group.name}</span>
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.6px' }}>
          {group.name}
        </h1>
        {newHigh && (
          <span style={{
            fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
            backgroundColor: 'var(--up-color, #C92F2F)', color: '#FFFFFF',
          }}>
            신고가
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 24px', fontSize: '13.5px', color: 'var(--text-dim)' }}>
        {master.sido} {district}{group.dong ? ` ${group.dong}` : ''}
        {group.buildYear ? ` · ${group.buildYear}년 입주` : ''}
        {group.households ? ` · ${group.households.toLocaleString()}세대` : ''}
        {master.totalDongs ? ` · ${master.totalDongs}개동` : ''}
      </p>

      {sorted.length === 0 ? (
        <div style={{
          padding: '48px 24px', borderRadius: '16px', textAlign: 'center',
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
        }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
            최근 {APT_PAGE_MONTHS}개월 내 신고된 매매 거래가 없습니다.
          </p>
          <Link href={deepLink} style={{ display: 'inline-block', marginTop: '14px', fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>
            {district} 전체 실거래 보기 →
          </Link>
        </div>
      ) : (
        <>
          {/* 통계 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
            <StatCard label="최근 실거래가" value={fmtPrice(latest.price)} sub={`${fmtContractDate(latest.date)} · ${latest.area}㎡`} />
            <StatCard label={`${APT_PAGE_MONTHS}개월 평균`} value={fmtPrice(avg)} sub={`${sorted.length}건 기준`} />
            <StatCard label="최고 실거래가" value={maxTx ? fmtPrice(maxPrice) : '—'} sub={maxTx ? fmtContractDate(maxTx.date) : undefined} />
            <StatCard
              label="전고점 회복률"
              value={recovery ? `${recovery.pct}%` : '—'}
              sub={recovery ? (recovery.pct >= 100 ? '전고점 경신' : '기간 내 최고가 기준') : undefined}
            />
          </div>

          {/* 시세 차트 */}
          <div style={{ marginBottom: '24px' }}>
            <PriceComboChart transactions={sorted} maxPrice={maxPrice} height={220} />
          </div>

          {/* 거래 내역 테이블 (서버 렌더 — 최근 30건) */}
          <section style={{
            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '16px', overflow: 'hidden', marginBottom: '10px',
          }}>
            <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                최근 거래 내역
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                최근 {APT_PAGE_MONTHS}개월 · 계약일순
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                    {['계약일', '면적', '층', '거래가', '평당가'].map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, TABLE_LIMIT).map((tx, i) => {
                    const isMax = tx.price === maxPrice && maxTx !== null &&
                      i === sorted.findIndex((t) => t.price === maxPrice);
                    return (
                      <tr key={i} style={{ borderTop: '1px solid var(--border-light)' }}>
                        <td style={tdStyle}>{fmtContractDate(tx.date)}</td>
                        <td style={tdStyle}>{tx.area}㎡ · {Math.round(tx.area / 3.3058)}평</td>
                        <td style={tdStyle}>{tx.floor}층</td>
                        <td style={{
                          ...tdStyle, fontWeight: 700, fontFamily: 'Roboto Mono, monospace',
                          color: isMax ? 'var(--up-color, #C92F2F)' : 'var(--text-primary)',
                        }}>
                          {fmtPriceFull(tx.price)}
                        </td>
                        <td style={{ ...tdStyle, fontSize: '12px', fontFamily: 'Roboto Mono, monospace', color: 'var(--text-dim)' }}>
                          {fmtPrice(tx.pricePerArea)}/평
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sorted.length > TABLE_LIMIT && (
              <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-light)' }}>
                <Link href={deepLink} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
                  전체 {sorted.length}건을 실거래 조회에서 보기 →
                </Link>
              </div>
            )}
          </section>

          <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: '0 0 24px', lineHeight: 1.8 }}>
            ※ 출처: 국토교통부 실거래가 공개시스템 · 신고 지연·해제 거래로 실제와 차이가 있을 수 있습니다.
            전고점 회복률은 최근 {APT_PAGE_MONTHS}개월 내 대표 면적 최고가 기준입니다.
          </p>

          {/* 공유 액션 */}
          <div style={{ marginBottom: '24px' }}>
            <AptShareActions group={group} pageUrl={`${SITE_URL}/apt/${encodeURIComponent(master.id)}`} />
          </div>

          <AnalysisPromoBar />
        </>
      )}
    </div>
  );
}

function AptSkeleton() {
  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '40px 24px 56px' }} aria-hidden>
      <div style={{ height: '14px', width: '220px', borderRadius: '6px', backgroundColor: 'var(--border-light)', marginBottom: '18px' }} />
      <div style={{ height: '34px', width: '320px', borderRadius: '8px', backgroundColor: 'var(--border-light)', marginBottom: '10px' }} />
      <div style={{ height: '14px', width: '260px', borderRadius: '6px', backgroundColor: 'var(--border-light)', marginBottom: '28px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '20px' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: '86px', borderRadius: '12px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }} />
        ))}
      </div>
      <div style={{ height: '250px', borderRadius: '12px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }} />
    </div>
  );
}

export default function AptPage({ params }: { params: Promise<{ id: string }> }) {
  // 동적 라우트의 PPR 셸에서는 Header 포함 전체를 Suspense 로 감싼다
  // (blog/[slug]·preview/[id] 컨벤션 — Header 가 셸 프리렌더에서 동적 접근으로 판정됨)
  return (
    <Suspense
      fallback={
        <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
          <AptSkeleton />
        </main>
      }
    >
      <Header />
      <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
        <AptContent params={params} />
      </main>
      <Footer />
    </Suspense>
  );
}
