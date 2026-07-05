'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { TxErrorState, TxEmptyState } from '@/components/shared/TxStates';
import { AnalysisPromoBar } from '@/components/shared/AnalysisPromoBar';
import { SaveImageButton } from '@/components/shared/SaveImageButton';
import { fmtPrice, fmtContractDate } from '@/lib/tx-shared';
import {
  buildRankingShareImage, shareOrDownloadImage, type RankingShareRow,
} from '@/lib/share-image';

/**
 * 오늘의 주요거래 — 사이클 X (최종 디자인 TURN 4 리포트 뷰)
 *
 * 신고가 / 급등 / 국평(84㎡) 고가 3개 카테고리 순위표.
 * 행 클릭 → 실거래 조회 딥링크. 카드 보기 토글은 백로그.
 */

interface BaseDeal {
  district: string; apt: string; area: number; floor: number;
  price: number; date: string;
}
interface NewHighDeal extends BaseDeal { prevHigh: number }
interface SurgeDeal   extends BaseDeal { prevPrice: number; ratePct: number }

interface HighlightsData {
  month:     string;
  coverage:  string;
  newHighs:  NewHighDeal[];
  surges:    SurgeDeal[];
  pyeong84:  BaseDeal[];
  updatedAt: string;
}

function fullDateLabel(d: Date) {
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}(${day})`;
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px', fontSize: '11px', fontWeight: 700,
  color: 'var(--text-strong)', textAlign: 'left', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '12px 14px', fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap',
};

function SectionCard({
  emoji, title, sub, headers, onSave, cardView, children,
}: {
  emoji: string; title: string; sub: string;
  headers: string[]; onSave?: () => Promise<void>;
  /** true 면 테이블 래핑 없이 children(카드 그리드)을 그대로 렌더 */
  cardView?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section style={{
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '16px', overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 18px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          {emoji} {title}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-dim)', flex: 1 }}>{sub}</span>
        {onSave && <SaveImageButton onSave={onSave} />}
      </div>
      {cardView ? (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))',
          gap: '10px', padding: '4px 18px 18px',
        }}>
          {children}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                {headers.map((h) => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** 카드뷰 개별 딜 카드 — 표의 한 행을 카드로 (모바일 가독) */
function DealMiniCard({
  district, apt, meta, price, priceColor, extra,
}: {
  district: string; apt: string; meta: string;
  price: string; priceColor?: string; extra?: string;
}) {
  return (
    <Link
      href={`/transactions?district=${encodeURIComponent(district)}&q=${encodeURIComponent(apt)}`}
      style={{
        display: 'block', padding: '13px 15px', borderRadius: '12px',
        backgroundColor: 'var(--bg-overlay, var(--bg-tertiary))',
        border: '1px solid var(--border-light)', textDecoration: 'none',
      }}
    >
      <p style={{
        margin: 0, fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>
        {apt}
      </p>
      <p style={{ margin: '3px 0 8px', fontSize: '11.5px', color: 'var(--text-dim)' }}>
        {district} · {meta}
      </p>
      <p style={{
        margin: 0, fontSize: '16px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace',
        color: priceColor ?? 'var(--text-primary)',
      }}>
        {price}
        {extra && (
          <span style={{ marginLeft: '7px', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'inherit' }}>
            {extra}
          </span>
        )}
      </p>
    </Link>
  );
}

function AptLink({ district, apt }: { district: string; apt: string }) {
  return (
    <Link
      href={`/transactions?district=${encodeURIComponent(district)}&q=${encodeURIComponent(apt)}`}
      style={{ color: 'var(--text-primary)', fontWeight: 700, textDecoration: 'none' }}
      className="hover:underline"
    >
      {apt}
    </Link>
  );
}

export default function HighlightsClient() {
  const [data, setData] = useState<HighlightsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [today, setToday] = useState(new Date(0));
  const [view, setView] = useState<'table' | 'card'>('table');

  // hydration mismatch 방지 — mount 후 비동기 주입 (동기 setState 룰 회피)
  useEffect(() => {
    const id = window.setTimeout(() => setToday(new Date()), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/transactions/highlights')
      .then((r) => r.json())
      .then((json) => { if (!cancelled) { setData(json); setFailed(!!json.error); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [retryKey]);

  const loading = data === null && !failed;
  const empty = data !== null && !failed &&
    data.newHighs.length === 0 && data.surges.length === 0 && data.pyeong84.length === 0;

  // 섹션 → 브랜드 공유 카드 (사이클 CC)
  const saveSection = async (sectionTitle: string, rows: RankingShareRow[]) => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    const blob = await buildRankingShareImage({
      title: `오늘의 주요거래 — ${sectionTitle}`,
      subtitle: `${dateStr} 공개 · 최근 1개월 신고분 기준`,
      rows: rows.slice(0, 5),
    });
    if (blob) {
      await shareOrDownloadImage(blob, `내집-주요거래-${sectionTitle}.png`, `오늘의 주요거래 — ${sectionTitle}`);
    }
  };

  return (
    <>
      <Header />
      <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '48px 24px' }}>

          {/* 타이틀 밴드 */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              backgroundColor: '#FDECEC', color: '#E23B3B',
              fontWeight: 700, fontSize: '12px', padding: '5px 11px',
              borderRadius: '99px', marginBottom: '12px',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#E23B3B', display: 'inline-block' }} />
              {today.getFullYear() > 2000 ? fullDateLabel(today) : '—'} · 오늘 공개된 거래
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(22px, 3vw, 29px)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.6px' }}>
                오늘의 주요거래
              </h1>
              {/* 표 ↔ 카드 보기 토글 (사이클 HH) */}
              <div style={{ display: 'flex', gap: '4px', padding: '3px', borderRadius: '10px', backgroundColor: 'var(--border-light)' }}>
                {([['table', '표'], ['card', '카드']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setView(key)}
                    style={{
                      padding: '6px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 700,
                      border: 'none', cursor: 'pointer',
                      backgroundColor: view === key ? 'var(--bg-card)' : 'transparent',
                      color: view === key ? 'var(--text-primary)' : 'var(--text-dim)',
                      boxShadow: view === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
              신고가·급등·국평 고가 매매를 한눈에. 단지를 누르면 상세 실거래로 이동합니다.
            </p>
          </div>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} style={{
                  height: '260px', borderRadius: '16px',
                  backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              ))}
              <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.6}}`}</style>
            </div>
          )}

          {failed && !loading && (
            <TxErrorState onRetry={() => { setData(null); setFailed(false); setRetryKey((k) => k + 1); }} />
          )}

          {empty && <TxEmptyState />}

          {data && !failed && !empty && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 신고가 */}
              {data.newHighs.length > 0 && (
                <SectionCard
                  emoji="🔥" title="신고가 주요거래" sub="동일 면적 종전 최고가 경신"
                  headers={['시군구', '아파트명', '면적', '가격', '종전 최고가', '계약일']}
                  onSave={() => saveSection('신고가', data.newHighs.map((d, i) => ({
                    rank: i + 1, name: d.apt,
                    sub: `${d.district} · ${d.area}㎡ · ${fmtContractDate(d.date)} 계약`,
                    value: fmtPrice(d.price),
                    valueSub: `종전 ${fmtPrice(d.prevHigh)}`, valueColor: '#C92F2F',
                  })))}
                  cardView={view === 'card'}
                >
                  {view === 'card'
                    ? data.newHighs.map((d, i) => (
                        <DealMiniCard
                          key={i} district={d.district} apt={d.apt}
                          meta={`${d.area}㎡ · ${fmtContractDate(d.date)}`}
                          price={fmtPrice(d.price)} priceColor="var(--up-color, #C92F2F)"
                          extra={`종전 ${fmtPrice(d.prevHigh)}`}
                        />
                      ))
                    : data.newHighs.map((d, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={tdStyle}>{d.district}</td>
                      <td style={tdStyle}><AptLink district={d.district} apt={d.apt} /></td>
                      <td style={tdStyle}>{d.area}㎡</td>
                      <td style={{ ...tdStyle, fontWeight: 800, color: 'var(--up-color, #C92F2F)', fontFamily: 'Roboto Mono, monospace' }}>
                        {fmtPrice(d.price)}
                      </td>
                      <td style={tdStyle}>{fmtPrice(d.prevHigh)}</td>
                      <td style={tdStyle}>{fmtContractDate(d.date)}</td>
                    </tr>
                  ))}
                </SectionCard>
              )}

              {/* 급등 */}
              {data.surges.length > 0 && (
                <SectionCard
                  emoji="⚡" title="급등 거래" sub="직전 거래 대비 상승률"
                  headers={['시군구', '아파트명', '면적', '가격', '직전 거래', '상승률']}
                  onSave={() => saveSection('급등', data.surges.map((d, i) => ({
                    rank: i + 1, name: d.apt,
                    sub: `${d.district} · ${d.area}㎡ · 직전 ${fmtPrice(d.prevPrice)}`,
                    value: fmtPrice(d.price),
                    valueSub: `▲ ${d.ratePct}%`, valueColor: '#C92F2F',
                  })))}
                  cardView={view === 'card'}
                >
                  {view === 'card'
                    ? data.surges.map((d, i) => (
                        <DealMiniCard
                          key={i} district={d.district} apt={d.apt}
                          meta={`${d.area}㎡ · 직전 ${fmtPrice(d.prevPrice)}`}
                          price={fmtPrice(d.price)}
                          extra={`▲ ${d.ratePct}%`}
                        />
                      ))
                    : data.surges.map((d, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={tdStyle}>{d.district}</td>
                      <td style={tdStyle}><AptLink district={d.district} apt={d.apt} /></td>
                      <td style={tdStyle}>{d.area}㎡</td>
                      <td style={{ ...tdStyle, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>
                        {fmtPrice(d.price)}
                      </td>
                      <td style={tdStyle}>{fmtPrice(d.prevPrice)}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--up-color, #C92F2F)' }}>
                        ▲ {d.ratePct}%
                      </td>
                    </tr>
                  ))}
                </SectionCard>
              )}

              {/* 국평 고가 */}
              {data.pyeong84.length > 0 && (
                <SectionCard
                  emoji="🏆" title="국평(84㎡) 고가 거래" sub="전용 80~88㎡ 최고가"
                  headers={['시군구', '아파트명', '면적', '가격', '층', '계약일']}
                  onSave={() => saveSection('국평 고가', data.pyeong84.map((d, i) => ({
                    rank: i + 1, name: d.apt,
                    sub: `${d.district} · ${d.area}㎡ · ${d.floor}층`,
                    value: fmtPrice(d.price),
                    valueSub: `${fmtContractDate(d.date)} 계약`,
                  })))}
                  cardView={view === 'card'}
                >
                  {view === 'card'
                    ? data.pyeong84.map((d, i) => (
                        <DealMiniCard
                          key={i} district={d.district} apt={d.apt}
                          meta={`${d.area}㎡ · ${d.floor}층`}
                          price={fmtPrice(d.price)}
                          extra={fmtContractDate(d.date)}
                        />
                      ))
                    : data.pyeong84.map((d, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={tdStyle}>{d.district}</td>
                      <td style={tdStyle}><AptLink district={d.district} apt={d.apt} /></td>
                      <td style={tdStyle}>{d.area}㎡</td>
                      <td style={{ ...tdStyle, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>
                        {fmtPrice(d.price)}
                      </td>
                      <td style={tdStyle}>{d.floor}층</td>
                      <td style={tdStyle}>{fmtContractDate(d.date)}</td>
                    </tr>
                  ))}
                </SectionCard>
              )}

              <p style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.8 }}>
                ※ 최근 1개월 공개분 · {data.coverage} · 출처: 국토교통부 실거래가 공개시스템
              </p>

              <AnalysisPromoBar />
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
