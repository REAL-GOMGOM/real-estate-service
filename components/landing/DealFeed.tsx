'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  type AptGroup,
  fmtPrice, fmtContractDate, detectNewHigh, sparkSeries, peakRecovery,
} from '@/lib/tx-shared';
import { smoothPath, type Pt } from '@/lib/svg-smooth';
import { TxErrorState, TxEmptyState } from '@/components/shared/TxStates';
import { buildShareImage } from '@/lib/share-image';

/**
 * 메인 실거래 카드 피드 — 사이클 W (실데이터).
 *
 * /api/transactions 를 직접 조회해 최근 계약 순으로 카드 렌더.
 * 스파크라인은 대표 면적의 실거래 이력을 그대로 그린다 (목업 곡선 제거).
 * 카드 클릭 → 실거래 조회 딥링크(/transactions?district=&q=), 공유는 팝오버.
 */

interface FeedDeal {
  apt:      string;
  district: string;
  dong:     string;
  price:    number;
  delta:    number | null;   // 직전 동일면적 거래 대비 (만원)
  up:       boolean;
  area:     number;
  floor:    number;
  date:     string;
  prevPrice: number | null;
  prevDate:  string | null;
  high:     boolean;
  spark:    Pt[];            // 0~100 × 0~56 좌표계 (월평균 스무딩)
  sparkUp:  boolean;
  /** 전고점 회복률 (사이클 BB) — 100% 미만일 때만 카드에 표시 */
  recovery: { peak: number; peakDate: string; pct: number } | null;
}

interface DealFeedProps {
  district: string;
}

/** 대표 면적 실거래 이력 → 시간축 비례 좌표 (0~100 × 0~56, silgga 스타일) */
function buildSpark(group: AptGroup): { pts: Pt[]; up: boolean } | null {
  const series = sparkSeries(group);
  if (!series) return null;

  const prices = series.points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const pts: Pt[] = series.points.map((p) => ({
    x: 3 + p.t * 94,
    y: 7 + (1 - (p.price - min) / span) * 42,
  }));
  return { pts, up: series.rising };
}

/** AptGroup[] → 최근 계약 순 피드 아이템 */
function toFeedDeals(groups: AptGroup[], limit: number): FeedDeal[] {
  const deals: FeedDeal[] = [];

  for (const g of groups) {
    const sorted = [...g.transactions].sort((a, b) => b.date.localeCompare(a.date));
    const latest = sorted[0];
    if (!latest) continue;

    // 직전 동일 면적(±6㎡) 거래
    const prev = sorted.find(
      (t) => t !== latest && Math.abs(t.area - latest.area) <= 6
    ) ?? null;

    const spark = buildSpark(g);
    const rec = peakRecovery(g);

    deals.push({
      apt:      g.name,
      district: g.district,
      dong:     g.dong ?? '',
      price:    latest.price,
      delta:    prev ? latest.price - prev.price : null,
      up:       prev ? latest.price - prev.price >= 0 : (spark?.up ?? true),
      area:     latest.area,
      floor:    latest.floor,
      date:     latest.date,
      prevPrice: prev?.price ?? null,
      prevDate:  prev?.date ?? null,
      high:     detectNewHigh(g),
      spark:    spark?.pts ?? [],
      sparkUp:  spark?.up ?? true,
      recovery: rec ? { peak: rec.peak, peakDate: rec.peakDate, pct: rec.pct } : null,
    });
  }

  return deals
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

function SparkThumb({ pts }: { pts: Pt[] }) {
  // silgga 스타일 — 방향 색 없이 잔잔한 다크 라인. 포인트 적으면 곡선 보정.
  const line = pts.length >= 5
    ? `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')}`
    : smoothPath(pts);
  const first = pts[0];
  const last = pts[pts.length - 1];
  const area = `${line} L${last.x.toFixed(1)},56 L${first.x.toFixed(1)},56 Z`;

  return (
    <div
      aria-hidden
      className="shrink-0 overflow-hidden"
      style={{
        width: '96px', height: '72px', borderRadius: '11px',
        backgroundColor: '#FAFBFE', border: '1px solid #F0F3F9',
      }}
    >
      <svg viewBox="0 0 100 56" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
        <path d={area} fill="rgba(61,78,110,0.08)" />
        <path
          d={line}
          fill="none"
          stroke="#3D4E6E"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {last && <circle cx={last.x} cy={last.y} r="2.6" fill="#3D4E6E" />}
      </svg>
    </div>
  );
}

/** 공유 팝오버 — 링크 복사 / 요약 텍스트 복사 선택 */
function SharePopover({ deal }: { deal: FeedDeal }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<'link' | 'text' | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const url = `https://www.naezipkorea.com/transactions?district=${encodeURIComponent(deal.district)}&q=${encodeURIComponent(deal.apt)}`;
  const text = `${deal.district} ${deal.apt} ${fmtPrice(deal.price)} (${deal.area}㎡·${deal.floor}층·${fmtContractDate(deal.date)} 계약) · 내집 My.ZIP\n${url}`;

  const copy = async (kind: 'link' | 'text', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(kind === 'link' ? url : text);
      setDone(kind);
      setTimeout(() => { setDone(null); setOpen(false); }, 1200);
    } catch {
      // 클립보드 미지원 — 무시
    }
  };

  const saveImage = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const blob = await buildShareImage({
        apt: deal.apt,
        location: `${deal.district}${deal.dong ? ' ' + deal.dong : ''}`,
        price: fmtPrice(deal.price),
        delta: deal.delta !== null && deal.delta !== 0
          ? `${deal.up ? '▲' : '▼'} ${fmtPrice(Math.abs(deal.delta))}` : '',
        up: deal.up,
        meta: `${deal.area}㎡ · ${Math.round(deal.area / 3.3058)}평 · ${deal.floor}층 · ${fmtContractDate(deal.date)} 계약`,
        spark: deal.spark,
        high: deal.high,
      });
      if (!blob) return;
      const file = new File([blob], `${deal.apt}-실거래.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: deal.apt });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${deal.apt}-실거래.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      setOpen(false);
    } catch { /* 공유 취소 무시 */ }
  };

  return (
    <div ref={ref} className="relative" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-1 cursor-pointer transition-colors"
        style={{
          fontSize: '11.5px', fontWeight: 700,
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          padding: '5px 11px', borderRadius: '8px',
        }}
      >
        ↗ 공유
      </button>

      {open && (
        <div
          className="absolute right-0 bottom-full mb-2 z-20 flex flex-col"
          style={{
            minWidth: '148px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 10px 28px rgba(20,33,61,0.14)',
            padding: '6px',
          }}
        >
          <button
            type="button"
            onClick={(e) => copy('link', e)}
            style={{
              textAlign: 'left', fontSize: '12.5px', fontWeight: 600,
              color: done === 'link' ? 'var(--success-text)' : 'var(--text-primary)',
              padding: '8px 10px', borderRadius: '7px',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            {done === 'link' ? '✓ 링크 복사됨' : '🔗 링크 복사'}
          </button>
          <button
            type="button"
            onClick={(e) => copy('text', e)}
            style={{
              textAlign: 'left', fontSize: '12.5px', fontWeight: 600,
              color: done === 'text' ? 'var(--success-text)' : 'var(--text-primary)',
              padding: '8px 10px', borderRadius: '7px',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            {done === 'text' ? '✓ 내용 복사됨' : '📋 거래 내용 복사'}
          </button>
          <button
            type="button"
            onClick={saveImage}
            style={{
              textAlign: 'left', fontSize: '12.5px', fontWeight: 600,
              color: 'var(--text-primary)',
              padding: '8px 10px', borderRadius: '7px',
              background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            🖼 이미지로 저장
          </button>
        </div>
      )}
    </div>
  );
}

const FEED_LIMIT = 8;

interface FeedResult {
  district: string;
  deals:    FeedDeal[];
  error:    boolean;
}

export function DealFeed({ district }: DealFeedProps) {
  // 결과에 조회 지역을 함께 저장 — 로딩 여부를 파생값으로 계산
  // (effect 안 동기 setState 없이 지역 전환 시 자동으로 스켈레톤 복귀)
  const [result, setResult] = useState<FeedResult | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // 36개월 — silgga 형 시세 차트 밀도 확보. limit=20 으로 페이로드 축소
    // (피드 카드는 8개, 최신 계약 순 선별 여유분 포함)
    fetch(`/api/transactions?district=${encodeURIComponent(district)}&months=36&limit=20`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setResult({ district, deals: toFeedDeals(json.data ?? [], FEED_LIMIT), error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ district, deals: [], error: true });
      });
    return () => { cancelled = true; };
  }, [district, retryKey]);

  const loading = result === null || result.district !== district;
  const deals   = loading ? [] : result.deals;
  const error   = loading ? false : result.error;

  return (
    <main className="flex flex-col gap-3 min-w-0">
      {/* 피드 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-strong)' }}>최근 실거래</span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full"
            style={{
              backgroundColor: 'var(--danger-bg)', color: 'var(--danger)',
              fontSize: '11px', fontWeight: 700, padding: '3px 8px',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--danger)' }} />
            {district}
          </span>
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>국토부 공개분 · 계약일순</span>
      </div>

      {/* 로딩 스켈레톤 */}
      {loading && (
        <>
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              style={{
                height: '150px', borderRadius: '14px',
                backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
          <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.6}}`}</style>
        </>
      )}

      {/* 에러 / 빈 상태 — 최종 디자인 10b·10c */}
      {!loading && error && (
        <TxErrorState onRetry={() => { setResult(null); setRetryKey((k) => k + 1); }} />
      )}
      {!loading && !error && deals.length === 0 && <TxEmptyState />}

      {/* 카드 스트림 — 클릭 시 해당 단지 상세 딥링크 */}
      {!loading && deals.map((deal) => (
        <Link
          key={`${deal.apt}-${deal.date}-${deal.floor}`}
          href={`/transactions?district=${encodeURIComponent(deal.district)}&q=${encodeURIComponent(deal.apt)}`}
          style={{
            display: 'block',
            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '14px', padding: '16px 18px',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          className="hover:shadow-sm"
        >
          <article>
            <div className="flex gap-4">
              {deal.spark.length > 1 ? (
                <SparkThumb pts={deal.spark} />
              ) : (
                <div
                  aria-hidden
                  className="shrink-0 flex items-center justify-center"
                  style={{
                    width: '96px', height: '72px', borderRadius: '11px',
                    backgroundColor: '#FAFBFE', border: '1px solid #F0F3F9',
                    fontSize: '10px', color: 'var(--text-dim)',
                  }}
                >
                  첫 거래
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="truncate"
                    style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.3px' }}
                  >
                    {deal.apt}
                  </span>
                  {deal.high && (
                    <span
                      className="shrink-0"
                      style={{
                        fontSize: '10.5px', fontWeight: 700, color: 'var(--danger)',
                        backgroundColor: 'var(--danger-bg)', padding: '2px 7px', borderRadius: '6px',
                      }}
                    >
                      신고가
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '6px' }}>
                  {deal.district}{deal.dong ? ` ${deal.dong}` : ''} · {fmtContractDate(deal.date)} 계약
                </div>
                <div className="flex items-baseline gap-2">
                  <span style={{ fontSize: '21px', fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.5px' }}>
                    {fmtPrice(deal.price)}
                  </span>
                  {deal.delta !== null && deal.delta !== 0 && (
                    <span
                      style={{
                        fontSize: '13px', fontWeight: 700,
                        color: deal.up ? 'var(--up-color)' : 'var(--down-color)',
                      }}
                    >
                      {deal.up ? '▲' : '▼'} {fmtPrice(Math.abs(deal.delta))}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {deal.area}㎡ · {Math.round(deal.area / 3.3058)}평 · {deal.floor}층
                </div>
                {deal.prevPrice !== null && (
                  <div style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '1px' }}>
                    직전 거래 {fmtPrice(deal.prevPrice)}{deal.prevDate ? ` · ${fmtContractDate(deal.prevDate)}` : ''}
                  </div>
                )}
                {deal.recovery !== null && deal.recovery.pct < 100 && (
                  <div style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '1px' }}>
                    전고점 {fmtPrice(deal.recovery.peak)}({fmtContractDate(deal.recovery.peakDate)}) 대비{' '}
                    <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{deal.recovery.pct}%</span>
                  </div>
                )}
              </div>
            </div>
            <div
              className="flex items-center justify-end"
              style={{ marginTop: '13px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}
            >
              <SharePopover deal={deal} />
            </div>
          </article>
        </Link>
      ))}

      <Link
        href={`/transactions?district=${encodeURIComponent(district)}`}
        className="text-center transition-colors hover:opacity-80"
        style={{
          marginTop: '6px', border: '1px solid #D6DEEC', backgroundColor: 'var(--bg-card)',
          color: 'var(--text-secondary)', fontWeight: 700, fontSize: '13px',
          padding: '12px', borderRadius: '12px',
        }}
      >
        {district} 실거래 더 보기
      </Link>
    </main>
  );
}
