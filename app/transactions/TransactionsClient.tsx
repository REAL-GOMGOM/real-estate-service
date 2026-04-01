'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import ErrorState from '@/components/common/ErrorState';
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { DISTRICT_CODE } from '@/lib/district-codes';
import Header from '@/components/layout/Header';

const DISTRICTS = Object.keys(DISTRICT_CODE);

interface Transaction {
  aptName:      string;
  district:     string;
  area:         number;
  floor:        number;
  price:        number;
  pricePerArea: number;
  date:         string;
}

interface AptGroup {
  id:           string;
  name:         string;
  district:     string;
  areas:        number[];
  transactions: Transaction[];
}

// ── 헬퍼 ────────────────────────────────────────
function fmtPrice(manwon: number) {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}
function avgByArea(txs: Transaction[], target: number, tol = 6): number | null {
  const m = txs.filter((t) => Math.abs(t.area - target) <= tol);
  if (!m.length) return null;
  return Math.round(m.reduce((s, t) => s + t.price, 0) / m.length);
}
function detectNewHigh(apt: AptGroup): boolean {
  if (apt.transactions.length < 2) return false;
  const sorted = [...apt.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  const same   = apt.transactions.filter((t) => Math.abs(t.area - latest.area) <= 6);
  return same.length > 1 && latest.price >= Math.max(...same.map((t) => t.price));
}
function todayLabel(d: Date) {
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}.${d.getDate()}(${day})`;
}

// ── 통계 카드 ────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: '12px',
      backgroundColor: 'var(--border-light)',
      border: '1px solid var(--border)',
    }}>
      <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px' }}>{label}</p>
      <p style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{value}</p>
      {sub && <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '3px' }}>{sub}</p>}
    </div>
  );
}

// ── 차트 커스텀 툴팁 ─────────────────────────────
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      padding: '8px 12px', borderRadius: '8px',
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-hover)',
      fontSize: '12px',
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{d.date} · {d.area}㎡</p>
      <p style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtPrice(d.price)}</p>
    </div>
  );
}

// ── 상세 모달 ────────────────────────────────────
function AptDetailModal({ apt, onClose, months }: { apt: AptGroup; onClose: () => void; months: number }) {
  const [selArea, setSelArea] = useState<number | null>(null);

  const sorted     = [...apt.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const uniqueAreas = [...new Set(apt.transactions.map((t) => t.area))].sort((a, b) => a - b);

  const filtered = selArea !== null
    ? sorted.filter((t) => Math.abs(t.area - selArea) <= 6)
    : sorted;

  const latest   = filtered[0];
  const avgPrice = filtered.length ? Math.round(filtered.reduce((s, t) => s + t.price, 0) / filtered.length) : 0;
  const maxTx    = filtered.reduce<Transaction | null>((m, t) => (!m || t.price > m.price ? t : m), null);
  const maxPrice = maxTx?.price ?? 0;
  const newHigh  = detectNewHigh(apt);

  // 차트용 데이터 — 오래된 것부터
  const chartData = [...filtered]
    .reverse()
    .map((t, i) => ({ x: i, price: t.price, date: t.date, area: t.area }));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '700px', maxHeight: '90vh',
          backgroundColor: 'var(--bg-primary)',
          borderRadius: '20px',
          border: '1px solid var(--border)',
          overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* 모달 헤더 */}
        <div style={{
          padding: '24px 24px 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{apt.name}</h2>
              {newHigh && (
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
                  backgroundColor: '#EF4444', color: 'var(--text-primary)',
                }}>
                  신고가
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{apt.district}</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 면적 필터 */}
        <div style={{ padding: '16px 24px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelArea(null)}
            style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
              backgroundColor: selArea === null ? 'var(--accent)' : 'var(--border-light)',
              color:           selArea === null ? 'var(--text-primary)'  : 'var(--text-muted)',
              border: 'none', cursor: 'pointer',
            }}
          >
            전체
          </button>
          {uniqueAreas.map((area) => (
            <button
              key={area}
              onClick={() => setSelArea(selArea === area ? null : area)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                backgroundColor: selArea === area ? 'var(--accent)' : 'var(--border-light)',
                color:           selArea === area ? 'var(--text-primary)'  : 'var(--text-muted)',
                border: 'none', cursor: 'pointer',
              }}
            >
              {area}㎡ · {Math.round(area / 3.3058)}평
            </button>
          ))}
        </div>

        {/* 통계 카드 3개 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', padding: '0 24px 20px' }}>
          <StatCard label="최근 실거래가" value={latest ? fmtPrice(latest.price) : '—'} sub={latest?.date} />
          <StatCard label={`${months}개월 평균`}  value={filtered.length ? fmtPrice(avgPrice) : '—'} />
          <StatCard label="최고 실거래가"  value={maxTx ? fmtPrice(maxPrice) : '—'} sub={maxTx?.date} />
        </div>

        {/* 가격 차트 */}
        {chartData.length > 1 && (
          <div style={{ padding: '0 24px 20px' }}>
            <div style={{
              borderRadius: '12px', padding: '16px 8px 8px',
              backgroundColor: 'var(--bg-overlay)',
              border: '1px solid var(--border-light)',
            }}>
              <ResponsiveContainer width="100%" height={160}>
                <ScatterChart margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                  <XAxis dataKey="x" hide />
                  <YAxis
                    dataKey="price"
                    tickFormatter={(v) => fmtPrice(v)}
                    tick={{ fontSize: 11, fill: 'var(--text-dim)' }}
                    width={52}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {maxPrice > 0 && (
                    <ReferenceLine
                      y={maxPrice}
                      stroke="rgba(239,68,68,0.3)"
                      strokeDasharray="4 4"
                    />
                  )}
                  <Scatter data={chartData} fill="var(--accent)" opacity={0.85} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 거래 내역 테이블 */}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                {['계약일', '면적', '층', '거래가', '고점대비', '평당가'].map((h) => (
                  <th key={h} style={{
                    padding: '10px 12px', fontSize: '11px', fontWeight: 700,
                    color: 'var(--text-strong)', textAlign: 'left', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx, i) => {
                const ratio = maxPrice > 0 ? (tx.price / maxPrice) * 100 : null;
                const isMax = tx.price === maxPrice && i === filtered.findIndex((t) => t.price === maxPrice);
                return (
                  <tr
                    key={i}
                    style={{ borderTop: '1px solid var(--border-light)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(59,130,246,0.06)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                  >
                    <td style={{ padding: '11px 12px', fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {tx.date}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {tx.area}㎡
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: '13px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {tx.floor}층
                    </td>
                    <td style={{
                      padding: '11px 12px', fontSize: '14px', fontWeight: 700,
                      color: isMax ? '#EF4444' : 'var(--text-primary)',
                      fontFamily: 'Roboto Mono, monospace', whiteSpace: 'nowrap',
                    }}>
                      {isMax && (
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px',
                          backgroundColor: '#EF4444', color: 'var(--text-primary)', marginRight: '5px',
                          verticalAlign: 'middle',
                        }}>
                          신고가
                        </span>
                      )}
                      {fmtPrice(tx.price)}
                    </td>
                    <td style={{
                      padding: '11px 12px', fontSize: '12px', whiteSpace: 'nowrap',
                      color: ratio !== null ? (ratio >= 100 ? '#EF4444' : ratio >= 90 ? '#F59E0B' : 'var(--text-dim)') : 'var(--text-dim)',
                    }}>
                      {ratio !== null ? `${ratio.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{
                      padding: '11px 12px', fontSize: '12px', color: 'var(--text-dim)',
                      fontFamily: 'Roboto Mono, monospace', whiteSpace: 'nowrap',
                    }}>
                      {fmtPrice(tx.pricePerArea)}/평
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 아파트 카드 ──────────────────────────────────
function AptCard({ apt, onClick }: { apt: AptGroup; onClick: () => void }) {
  const sorted  = [...apt.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const latest  = sorted[0];
  const newHigh = detectNewHigh(apt);
  const avg59   = avgByArea(apt.transactions, 59);
  const avg84   = avgByArea(apt.transactions, 84);

  return (
    <div
      onClick={onClick}
      style={{
        padding: '20px', borderRadius: '16px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.35)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      {/* 단지명 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>{apt.name}</p>
          <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{apt.district} · {apt.transactions.length}건</p>
        </div>
        {newHigh && (
          <span style={{
            fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
            backgroundColor: 'rgba(239,68,68,0.14)', color: '#EF4444', flexShrink: 0,
          }}>
            신고가
          </span>
        )}
      </div>

      {/* 최근 거래가 */}
      <p style={{
        fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)',
        fontFamily: 'Roboto Mono, monospace', marginBottom: '4px', lineHeight: 1,
      }}>
        {fmtPrice(latest.price)}
      </p>
      <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '14px' }}>
        {latest.area}㎡ · {latest.floor}층 · {latest.date}
      </p>

      {/* 면적별 평균 */}
      {(avg59 || avg84) && (
        <div style={{
          display: 'flex', gap: '14px',
          paddingTop: '12px', borderTop: '1px solid var(--border-light)',
        }}>
          {avg59 && (
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              59㎡&nbsp;
              <strong style={{ color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>{fmtPrice(avg59)}</strong>
            </span>
          )}
          {avg84 && (
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              84㎡&nbsp;
              <strong style={{ color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>{fmtPrice(avg84)}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────
export default function TransactionsClient() {
  const searchParams = useSearchParams();
  const districtParam = searchParams.get('district');

  const [today,      setToday]      = useState(new Date(0));
  useEffect(() => { setToday(new Date()); }, []);
  const [district,   setDistrict]   = useState('강남구');
  const [months,     setMonths]     = useState(6);
  const [query,      setQuery]      = useState('');
  const [groups,     setGroups]     = useState<AptGroup[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [fetched,    setFetched]    = useState('');
  const [activeApt,  setActiveApt]  = useState<AptGroup | null>(null);

  const [viewMode, setViewMode] = useState<'summary' | 'detail'>(
    districtParam ? 'detail' : 'summary'
  );
  const [summaryData, setSummaryData] = useState<any[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // districtParam이 있으면 바로 해당 지역 detail 뷰로 진입
  useEffect(() => {
    if (districtParam) {
      setDistrict(districtParam);
      setViewMode('detail');
      setFetched('');
    }
  }, [districtParam]);

  const load = useCallback(async (d: string, m: number) => {
    const key = `${d}-${m}`;
    if (fetched === key) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/transactions?district=${encodeURIComponent(d)}&months=${m}`);
      const json = await res.json();
      setGroups(json.data ?? []);
      setFetched(key);
    } catch {
      setGroups([]);
      setError('데이터 조회에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [fetched]);

  useEffect(() => {
    if (viewMode === 'detail') load(district, months);
  }, [district, months, viewMode]);

  // 시도별 요약 데이터 fetch
  useEffect(() => {
    if (viewMode !== 'summary') return;
    setSummaryLoading(true);
    fetch('/api/transactions/summary')
      .then(r => r.json())
      .then(json => {
        setSummaryData(json.summary || []);
        setSummaryLoading(false);
      })
      .catch(() => setSummaryLoading(false));
  }, [viewMode]);

  const filtered   = query.trim() ? groups.filter((g) => g.name.includes(query.trim())) : groups;
  const totalTx    = filtered.reduce((s, g) => s + g.transactions.length, 0);
  const newHighCnt = filtered.filter(detectNewHigh).length;

  return (
    <>
    <Header />
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px' }}>

        {/* 헤더 */}
        <div style={{ marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 800, color: 'var(--text-primary)' }}>
              최신 실거래
            </h1>
            <span style={{
              padding: '4px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
            }}>
              {today.getFullYear() > 2000 ? todayLabel(today) : '—'}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>출처: 국토교통부 실거래공개시스템</p>
        </div>

        {/* 시도별 요약 카드 뷰 */}
        {viewMode === 'summary' && (
          <>
            {summaryLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} style={{
                    height: '160px', borderRadius: '16px',
                    backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }} />
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {summaryData.map((region) => (
                  <button
                    key={region.label}
                    onClick={() => {
                      setDistrict(region.firstDistrict);
                      setViewMode('detail');
                      setFetched('');
                    }}
                    style={{
                      padding: '20px', borderRadius: '16px',
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {/* 상단: 시도명 + 거래건수 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {region.label}
                      </span>
                      <span style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace', color: 'var(--text-primary)' }}>
                        {region.estimatedCount.toLocaleString()}건
                      </span>
                    </div>

                    {/* 신고가 */}
                    {region.newHighs > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                          신고가{' '}
                          <strong style={{ color: '#EF4444' }}>{region.newHighs}</strong>건
                        </span>
                      </div>
                    )}

                    {/* 하단: 평균가 */}
                    <div style={{
                      display: 'flex', gap: '14px',
                      paddingTop: '12px', borderTop: '1px solid var(--border-light)',
                    }}>
                      {region.avg59 && (
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                          59㎡{' '}
                          <strong style={{ color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>
                            {region.avg59 >= 10000 ? `${(region.avg59 / 10000).toFixed(1)}억` : `${region.avg59.toLocaleString()}만`}
                          </strong>
                        </span>
                      )}
                      {region.avg84 && (
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                          84㎡{' '}
                          <strong style={{ color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>
                            {region.avg84 >= 10000 ? `${(region.avg84 / 10000).toFixed(1)}억` : `${region.avg84.toLocaleString()}만`}
                          </strong>
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <p style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-dim)' }}>
              ※ 대표 구 기준 추정치입니다. 지역을 클릭하면 상세 거래를 확인할 수 있습니다.
            </p>
          </>
        )}

        {/* detail 뷰: 뒤로가기 + 기존 상세 */}
        {viewMode === 'detail' && (
          <>
        <button
          onClick={() => setViewMode('summary')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '13px', fontWeight: 600, color: 'var(--accent)',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 0', marginBottom: '12px',
          }}
        >
          ← 전체 보기
        </button>

        {/* 매매 탭 */}
        <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '20px', display: 'flex' }}>
          <button style={{
            padding: '12px 4px', marginRight: '24px', fontSize: '15px', fontWeight: 700,
            color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'default',
            borderBottom: '2px solid var(--accent)', marginBottom: '-1px',
          }}>
            매매
          </button>
        </div>

        {/* 통계 바 */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <span style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
              총&nbsp;<strong style={{ color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{totalTx.toLocaleString()}</strong>건
            </span>
            {newHighCnt > 0 && (
              <span style={{ fontSize: '14px', color: 'var(--text-dim)' }}>
                신고가&nbsp;<strong style={{ color: '#EF4444' }}>{newHighCnt}</strong>건
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '4px' }}>(조회 기간 내)</span>
              </span>
            )}
          </div>
        )}

        {/* 필터 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={district}
            onChange={(e) => { setDistrict(e.target.value); setFetched(''); }}
            style={{
              padding: '10px 14px', borderRadius: '10px', fontSize: '14px', fontWeight: 500,
              backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', cursor: 'pointer', outline: 'none',
            }}
          >
            {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>

          {([
            { label: '3개월',  value: 3  },
            { label: '6개월',  value: 6  },
            { label: '1년',    value: 12 },
            { label: '2년',    value: 24 },
            { label: '3년',    value: 36 },
          ] as { label: string; value: number }[]).map(({ label, value }) => (
            <button
              key={value}
              onClick={() => { setMonths(value); setFetched(''); }}
              style={{
                padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                backgroundColor: months === value ? 'var(--accent)' : 'var(--bg-card)',
                color:           months === value ? 'var(--text-primary)'  : 'var(--text-dim)',
                border: `1px solid ${months === value ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}

          <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="단지명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px 10px 36px', borderRadius: '10px',
                fontSize: '13px', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* 에러 상태 */}
        {error && !loading && (
          <ErrorState
            message="실거래 데이터를 불러오지 못했습니다"
            detail={error}
            onRetry={() => { setError(null); setFetched(''); load(district, months); }}
          />
        )}

        {/* 카드 그리드 */}
        {loading ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{
                  height: '156px', borderRadius: '16px',
                  backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              ))}
            </div>
            <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.6}}`}</style>
          </>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '14px' }}>
            {query ? `"${query}" 검색 결과 없음` : '거래 데이터 없음'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
            {filtered.map((apt) => (
              <AptCard key={apt.id} apt={apt} onClick={() => setActiveApt(apt)} />
            ))}
          </div>
        )}

        <p style={{ marginTop: '24px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.8 }}>
          ※ 매매 계약일 기준 · 신고가는 조회 기간 내 동일 면적 최고가 기준
        </p>
          </>
        )}
      </div>

      {/* 상세 모달 */}
      {activeApt && (
        <AptDetailModal
          apt={activeApt}
          onClose={() => setActiveApt(null)}
          months={months}
        />
      )}
    </main>
    </>
  );
}
