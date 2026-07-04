'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  type AptGroup,
  fmtPrice, fmtContractDate, detectNewHigh, representativeArea,
} from '@/lib/tx-shared';

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
  spark:    string;          // 0~100 × 0~56 좌표계 폴리라인
  sparkUp:  boolean;
}

interface DealFeedProps {
  district: string;
}

/** 대표 면적 실거래 이력 → SVG 폴리라인 좌표 (0~100 × 0~56) */
function buildSpark(group: AptGroup): { points: string; up: boolean } | null {
  const repArea = representativeArea(group);
  const pts = group.transactions
    .filter((t) => Math.abs(t.area - repArea) <= 6)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => t.price);

  if (pts.length < 2) return null;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const coords = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * 100;
    const y = 6 + (1 - (p - min) / span) * 44;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return { points: coords.join(' '), up: pts[pts.length - 1] >= pts[0] };
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
      spark:    spark?.points ?? '',
      sparkUp:  spark?.up ?? true,
    });
  }

  return deals
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

function SparkThumb({ points, up }: { points: string; up: boolean }) {
  const color = up ? 'var(--up-color)' : 'var(--down-color)';
  const fill = up ? 'rgba(201,47,47,0.08)' : 'rgba(27,77,219,0.08)';
  const pts = points.split(' ').map((p) => p.split(',').map(Number));
  const last = pts[pts.length - 1];
  const areaPath = `M${pts.map((p) => p.join(',')).join(' L')} L100,56 L0,56 Z`;

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
        <path d={areaPath} fill={fill} />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {last && <circle cx={last[0]} cy={last[1]} r="3.4" fill={color} />}
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

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/transactions?district=${encodeURIComponent(district)}&months=3`)
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
  }, [district]);

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

      {/* 에러 / 빈 상태 */}
      {!loading && (error || deals.length === 0) && (
        <div
          style={{
            padding: '48px 24px', textAlign: 'center', borderRadius: '14px',
            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-dim)', fontSize: '13px',
          }}
        >
          {error ? '실거래 데이터를 불러오지 못했습니다' : `${district} 최근 3개월 거래가 없습니다`}
        </div>
      )}

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
              {deal.spark ? (
                <SparkThumb points={deal.spark} up={deal.sparkUp} />
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
              </div>
            </div>
            <div
              className="flex items-center justify-between"
              style={{ marginTop: '13px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}
            >
              <span
                className="inline-flex items-center gap-1"
                style={{
                  fontSize: '11.5px', fontWeight: 700, color: 'var(--accent)',
                  backgroundColor: 'var(--btn-bg)', padding: '5px 10px', borderRadius: '8px',
                }}
              >
                출처 국토부 ↗
              </span>
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
