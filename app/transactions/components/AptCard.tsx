'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import {
  type AptGroup,
  fmtPrice, fmtPriceFull, fmtContractDate,
  detectNewHigh, representativeArea,
} from '../types';

/**
 * 아실형 단지 카드 — 사이클 W
 *
 * 구성: 단지명·신고가 뱃지 / 면적·평·층·동 / 가격 + 실거래 미니 라인차트 /
 *       전고점·신고가까지 남은 금액 / 계약일·입주연차·세대수·최근 3개월 거래·공유
 *
 * 미니 차트는 recharts 대신 순수 SVG polyline — 카드 60개 동시 렌더 성능 확보.
 * 대표 면적(거래 최다) 거래만 시간순으로 그려 "현실적인" 가격 흐름을 보여준다.
 */

interface AptCardProps {
  apt:     AptGroup;
  onClick: () => void;
}

/** 대표 면적 거래를 시간순 정렬해 SVG 좌표로 변환 */
function buildSparkline(apt: AptGroup, width: number, height: number) {
  const repArea = representativeArea(apt);
  const points = apt.transactions
    .filter((t) => Math.abs(t.area - repArea) <= 6)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (points.length < 2) return null;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const pad = 4;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (p.price - min) / span) * (height - pad * 2);
    return { x, y };
  });

  const rising = prices[prices.length - 1] >= prices[0];
  return { coords, rising, count: points.length };
}

export default function AptCard({ apt, onClick }: AptCardProps) {
  const [shared, setShared] = useState(false);

  const sorted  = [...apt.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const latest  = sorted[0];
  const newHigh = detectNewHigh(apt);

  // 전고점 — 동일 대표면적 기준 기간 최고가
  const repArea = representativeArea(apt);
  const samePrices = apt.transactions
    .filter((t) => Math.abs(t.area - repArea) <= 6)
    .map((t) => t.price);
  const peak = samePrices.length ? Math.max(...samePrices) : latest.price;
  const gapToPeak = peak - latest.price;

  // 최근 3개월 거래 수
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const cutoff = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
  const recentCount = apt.transactions.filter((t) => t.date >= cutoff).length;

  // 입주 연차
  const nowYear = new Date().getFullYear();
  const ageLabel = apt.buildYear
    ? `${apt.buildYear}년 입주(${nowYear - apt.buildYear}년차)`
    : null;

  const CHART_W = 132;
  const CHART_H = 66;
  const spark = buildSparkline(apt, CHART_W, CHART_H);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/transactions?district=${encodeURIComponent(apt.district)}&q=${encodeURIComponent(apt.name)}`;
    const text = `${apt.name} 최근 실거래 ${fmtPrice(latest.price)} (${latest.area}㎡·${latest.floor}층) · 전고점 ${fmtPrice(peak)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: apt.name, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setShared(true);
        setTimeout(() => setShared(false), 1600);
      }
    } catch {
      // 공유 취소 등은 무시
    }
  };

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: '16px', backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)', cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(20,33,61,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ padding: '18px 18px 14px' }}>
        {/* 단지명 + 신고가 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
          <p style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {apt.name}
          </p>
          {newHigh && (
            <span style={{
              flexShrink: 0, fontSize: '11px', fontWeight: 700, padding: '3px 8px',
              borderRadius: '6px', backgroundColor: 'rgba(201,47,47,0.12)',
              color: 'var(--up-color, #C92F2F)',
            }}>
              신고가
            </span>
          )}
        </div>

        {/* 면적·평·층·위치 */}
        <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '12px' }}>
          {latest.area}㎡ · {Math.round(latest.area / 3.3058)}평 · {latest.floor}층
          {apt.dong ? ` · ${apt.district} ${apt.dong}` : ` · ${apt.district}`}
        </p>

        {/* 가격 + 미니 차트 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{
              fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)',
              fontFamily: 'Roboto Mono, monospace', lineHeight: 1.15, marginBottom: '6px',
              whiteSpace: 'nowrap',
            }}>
              {fmtPriceFull(latest.price)}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
              전고점 {fmtPrice(peak)}
            </p>
            {gapToPeak > 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                신고가까지 {fmtPriceFull(gapToPeak)} 남음
              </p>
            ) : (
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--up-color, #C92F2F)' }}>
                전고점 경신
              </p>
            )}
          </div>

          {spark && (
            <svg
              width={CHART_W} height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              style={{ flexShrink: 0 }}
              aria-label={`${apt.name} 가격 추이 (거래 ${spark.count}건)`}
            >
              <polyline
                points={spark.coords.map((c) => `${c.x},${c.y}`).join(' ')}
                fill="none"
                stroke={spark.rising ? 'var(--up-color, #C92F2F)' : 'var(--down-color, #1636A8)'}
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle
                cx={spark.coords[spark.coords.length - 1].x}
                cy={spark.coords[spark.coords.length - 1].y}
                r="2.6"
                fill={spark.rising ? 'var(--up-color, #C92F2F)' : 'var(--down-color, #1636A8)'}
              />
            </svg>
          )}
        </div>
      </div>

      {/* 하단 메타 바 */}
      <div style={{
        padding: '10px 18px', borderTop: '1px solid var(--border-light)',
        backgroundColor: 'var(--bg-tertiary)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
      }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '2px' }}>
            {fmtContractDate(latest.date)} 계약
            <span style={{ marginLeft: '8px', color: 'var(--text-dim)' }}>
              최근 3개월 <strong style={{ color: 'var(--text-primary)' }}>{recentCount}건</strong>
            </span>
          </p>
          {(ageLabel || apt.households) && (
            <p style={{ fontSize: '11px', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {ageLabel}
              {ageLabel && apt.households ? ' · ' : ''}
              {apt.households ? `${apt.households.toLocaleString()}세대` : ''}
            </p>
          )}
        </div>
        <button
          onClick={handleShare}
          aria-label={`${apt.name} 공유`}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
            backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', cursor: 'pointer',
          }}
        >
          <Share2 size={13} />
          {shared ? '복사됨' : '공유'}
        </button>
      </div>
    </div>
  );
}
