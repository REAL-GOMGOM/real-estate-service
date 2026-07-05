'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  type AptGroup, type Transaction,
  fmtPrice, fmtContractDate, detectNewHigh,
} from '../types';

/**
 * 단지 상세 모달 — 사이클 W (아실형 차트)
 *
 * 산점도 → 시간축 기반 월평균 라인 + 개별 거래 도트 콤보로 교체.
 * X축이 실제 계약일 기준이라 거래 공백·밀집이 그대로 드러나 현실적.
 * 열림 중 배경 스크롤 잠금 (W1).
 */

interface AptDetailModalProps {
  apt:     AptGroup;
  onClose: () => void;
  months:  number;
}

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

function toTimestamp(date: string): number {
  // YYYY-MM-DD 또는 YYYY-MM (구캐시) 모두 처리
  const [y, m, d] = date.split('-').map((v) => parseInt(v));
  return new Date(y, (m ?? 1) - 1, d ?? 15).getTime();
}

function fmtTick(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface TooltipPayloadItem {
  payload?: {
    kind: 'deal' | 'month';
    ts: number;
    price?: number; avg?: number;
    date?: string; area?: number; floor?: number;
  };
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const d = (payload.find((p) => p.payload?.kind === 'deal')?.payload ?? payload[0].payload)!;
  return (
    <div style={{
      padding: '8px 12px', borderRadius: '8px',
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-hover)',
      fontSize: '12px',
    }}>
      {d.kind === 'deal' ? (
        <>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{fmtContractDate(d.date ?? '')} · {d.area}㎡ · {d.floor}층</p>
          <p style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtPrice(d.price ?? 0)}</p>
        </>
      ) : (
        <>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>{fmtTick(d.ts)} 월평균</p>
          <p style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtPrice(d.avg ?? 0)}</p>
        </>
      )}
    </div>
  );
}

export default function AptDetailModal({ apt, onClose, months }: AptDetailModalProps) {
  const [selArea, setSelArea] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  // 모달 열림 중 배경 페이지 스크롤 잠금 (스크롤바 이중 노출 방지)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const sorted      = [...apt.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const uniqueAreas = [...new Set(apt.transactions.map((t) => t.area))].sort((a, b) => a - b);

  const filtered = selArea !== null
    ? sorted.filter((t) => Math.abs(t.area - selArea) <= 6)
    : sorted;

  const latest   = filtered[0];
  const avgPrice = filtered.length ? Math.round(filtered.reduce((s, t) => s + t.price, 0) / filtered.length) : 0;
  const maxTx    = filtered.reduce<Transaction | null>((m, t) => (!m || t.price > m.price ? t : m), null);
  const maxPrice = maxTx?.price ?? 0;
  const newHigh  = detectNewHigh(apt);

  // 전고점 회복률 (사이클 BB) — 면적 필터에 연동, 거래 2건 이상일 때만
  const recoveryPct = latest && maxPrice > 0 && filtered.length >= 2
    ? Math.round((latest.price / maxPrice) * 1000) / 10
    : null;

  // 차트 데이터 — 개별 거래 도트 + 월평균 라인 (시간축).
  // filtered 가 렌더마다 새로 계산되는 파생값이라 memo 없이 직접 계산.
  const asc = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const dealDots = asc.map((t) => ({
    kind: 'deal' as const,
    ts: toTimestamp(t.date),
    price: t.price,
    date: t.date, area: t.area, floor: t.floor,
  }));

  const byMonth = new Map<string, number[]>();
  asc.forEach((t) => {
    const ym = t.date.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym)!.push(t.price);
  });
  const monthlyLine = [...byMonth.entries()].map(([ym, prices]) => ({
    kind: 'month' as const,
    ts: toTimestamp(ym + '-15'),
    avg: Math.round(prices.reduce((s, v) => s + v, 0) / prices.length),
  }));

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: 'rgba(10,16,32,0.6)',
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
          boxShadow: '0 24px 80px rgba(10,16,32,0.4)',
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
                  backgroundColor: 'var(--up-color, #C92F2F)', color: '#FFFFFF',
                }}>
                  신고가
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
              {apt.district}{apt.dong ? ` ${apt.dong}` : ''}
              {apt.buildYear ? ` · ${apt.buildYear}년 입주` : ''}
              {apt.households ? ` · ${apt.households.toLocaleString()}세대` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
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
              color:           selArea === null ? '#FFFFFF'       : 'var(--text-muted)',
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
                color:           selArea === area ? '#FFFFFF'       : 'var(--text-muted)',
                border: 'none', cursor: 'pointer',
              }}
            >
              {area}㎡ · {Math.round(area / 3.3058)}평
            </button>
          ))}
        </div>

        {/* 통계 카드 4개 — 전고점 회복률 포함 (사이클 BB) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', padding: '0 24px 20px' }}>
          <StatCard label="최근 실거래가" value={latest ? fmtPrice(latest.price) : '—'} sub={latest ? fmtContractDate(latest.date) : undefined} />
          <StatCard label={`${months}개월 평균`}  value={filtered.length ? fmtPrice(avgPrice) : '—'} />
          <StatCard label="최고 실거래가"  value={maxTx ? fmtPrice(maxPrice) : '—'} sub={maxTx ? fmtContractDate(maxTx.date) : undefined} />
          <StatCard
            label="전고점 회복률"
            value={recoveryPct !== null ? `${recoveryPct}%` : '—'}
            sub={recoveryPct !== null
              ? (recoveryPct >= 100 ? '전고점 경신' : '기간 내 최고가 기준')
              : undefined}
          />
        </div>

        {/* 가격 차트 — 월평균 라인 + 개별 거래 도트 (시간축) */}
        {dealDots.length > 1 && (
          <div style={{ padding: '0 24px 20px' }}>
            <div style={{
              borderRadius: '12px', padding: '16px 8px 8px',
              backgroundColor: 'var(--bg-overlay)',
              border: '1px solid var(--border-light)',
            }}>
              <ResponsiveContainer width="100%" height={190}>
                <ComposedChart margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={fmtTick}
                    tick={{ fontSize: 11, fill: 'var(--text-dim)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="price"
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => fmtPrice(v)}
                    tick={{ fontSize: 11, fill: 'var(--text-dim)' }}
                    width={56}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {maxPrice > 0 && (
                    <ReferenceLine
                      y={maxPrice}
                      stroke="rgba(201,47,47,0.35)"
                      strokeDasharray="4 4"
                    />
                  )}
                  <Line
                    data={monthlyLine}
                    dataKey="avg"
                    type="monotone"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                  <Scatter
                    data={dealDots}
                    dataKey="price"
                    fill="var(--accent)"
                    opacity={0.5}
                    shape={(props: { cx?: number; cy?: number }) => (
                      <circle cx={props.cx} cy={props.cy} r={3} fill="var(--accent)" opacity={0.55} />
                    )}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-dim)' }}>
              선 = 월평균 · 점 = 개별 거래 · 점선 = 기간 내 최고가
            </p>
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
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(27,77,219,0.05)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                  >
                    <td style={{ padding: '11px 12px', fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {fmtContractDate(tx.date)}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {tx.area}㎡
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: '13px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      {tx.floor}층
                    </td>
                    <td style={{
                      padding: '11px 12px', fontSize: '14px', fontWeight: 700,
                      color: isMax ? 'var(--up-color, #C92F2F)' : 'var(--text-primary)',
                      fontFamily: 'Roboto Mono, monospace', whiteSpace: 'nowrap',
                    }}>
                      {isMax && (
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px',
                          backgroundColor: 'var(--up-color, #C92F2F)', color: '#FFFFFF', marginRight: '5px',
                          verticalAlign: 'middle',
                        }}>
                          신고가
                        </span>
                      )}
                      {fmtPrice(tx.price)}
                    </td>
                    <td style={{
                      padding: '11px 12px', fontSize: '12px', whiteSpace: 'nowrap',
                      color: ratio !== null ? (ratio >= 100 ? 'var(--up-color, #C92F2F)' : ratio >= 90 ? '#B8860B' : 'var(--text-dim)') : 'var(--text-dim)',
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

        {/* 하단 액션 — 네이버 지도 + 공유 (최종 디자인 시안) */}
        <div style={{ padding: '16px 24px 22px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '9px' }}>
          <a
            href={`https://map.naver.com/p/search/${encodeURIComponent(`${apt.district} ${apt.name}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              border: '1px solid #D3E8DA', backgroundColor: '#F3FBF6', color: '#1F8A5B',
              fontWeight: 700, fontSize: '12.5px', padding: '10px', borderRadius: '11px',
              textDecoration: 'none',
            }}
          >
            <span style={{
              width: '17px', height: '17px', borderRadius: '5px', backgroundColor: '#03C75A',
              color: '#FFFFFF', fontSize: '10.5px', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              N
            </span>
            네이버 지도에서 위치·로드뷰 보기 ↗
          </a>
          <button
            onClick={async () => {
              const url = `${window.location.origin}/transactions?district=${encodeURIComponent(apt.district)}&q=${encodeURIComponent(apt.name)}`;
              const text = `${apt.name} 최근 실거래 ${latest ? fmtPrice(latest.price) : ''} · 내집 My.ZIP`;
              try {
                if (navigator.share) {
                  await navigator.share({ title: apt.name, text, url });
                } else {
                  await navigator.clipboard.writeText(`${text}\n${url}`);
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 1500);
                }
              } catch { /* 공유 취소 무시 */ }
            }}
            style={{
              border: 0, backgroundColor: 'var(--accent)', color: '#FFFFFF',
              fontWeight: 800, fontSize: '14px', padding: '14px', borderRadius: '12px',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {shareCopied ? '✓ 링크 복사됨' : '↗ 공유하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
