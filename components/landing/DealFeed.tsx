'use client';

import Link from 'next/link';
import { useState } from 'react';

/**
 * 사이클 U 메인 중앙 실거래 카드 피드 — 시안 1a.
 * 1차는 목업 데이터(MOCK_DEALS) 렌더. 실데이터(/api/transactions) 연동은 후속.
 */
export interface DealItem {
  apt: string;
  gu: string;
  dong: string;
  ago: string;
  price: string;
  delta: string;
  up: boolean;
  size: string;
  floor: string;
  contract: string;
  prev: string;
  prevDate: string;
  source: string;
  high?: boolean;
  /** 0~100 × 0~56 좌표계 폴리라인 포인트 */
  spark: string;
}

interface DealFeedProps {
  deals: DealItem[];
}

function SparkThumb({ points, up }: { points: string; up: boolean }) {
  const color = up ? 'var(--up-color)' : 'var(--down-color)';
  const fill = up ? 'rgba(226,59,59,0.08)' : 'rgba(27,77,219,0.08)';
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

function ShareButton({ deal }: { deal: DealItem }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const text = `${deal.gu} ${deal.apt} ${deal.price} (${deal.size}) · 내집 My.ZIP\nhttps://www.naezipkorea.com/transactions`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 미지원 환경 — 조용히 무시
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex items-center gap-1 cursor-pointer transition-colors"
      style={{
        fontSize: '11.5px', fontWeight: 700,
        color: copied ? 'var(--success-text)' : 'var(--text-secondary)',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        padding: '5px 11px', borderRadius: '8px',
      }}
    >
      {copied ? '✓ 복사됨' : '↗ 공유'}
    </button>
  );
}

export function DealFeed({ deals }: DealFeedProps) {
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
            LIVE
          </span>
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>15분 전 업데이트 · 최신순</span>
      </div>

      {/* 카드 스트림 */}
      {deals.map((deal) => (
        <article
          key={`${deal.apt}-${deal.contract}`}
          style={{
            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '14px', padding: '16px 18px',
          }}
        >
          <div className="flex gap-4">
            <SparkThumb points={deal.spark} up={deal.up} />
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
                {deal.gu} {deal.dong} · {deal.ago}
              </div>
              <div className="flex items-baseline gap-2">
                <span style={{ fontSize: '21px', fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.5px' }}>
                  {deal.price}
                </span>
                <span
                  style={{
                    fontSize: '13px', fontWeight: 700,
                    color: deal.up ? 'var(--up-color)' : 'var(--down-color)',
                  }}
                >
                  {deal.up ? '▲' : '▼'} {deal.delta}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {deal.size} · {deal.floor} · {deal.contract}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '1px' }}>
                직전 거래 {deal.prev} · {deal.prevDate}
              </div>
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
              출처 {deal.source} ↗
            </span>
            <ShareButton deal={deal} />
          </div>
        </article>
      ))}

      <Link
        href="/transactions"
        className="text-center transition-colors hover:opacity-80"
        style={{
          marginTop: '6px', border: '1px solid #D6DEEC', backgroundColor: 'var(--bg-card)',
          color: 'var(--text-secondary)', fontWeight: 700, fontSize: '13px',
          padding: '12px', borderRadius: '12px',
        }}
      >
        실거래 더 보기
      </Link>
    </main>
  );
}
