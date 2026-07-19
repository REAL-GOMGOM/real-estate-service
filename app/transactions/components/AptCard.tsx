'use client';

import { useState, useRef, useEffect } from 'react';
import { Share2 } from 'lucide-react';
import {
  type AptGroup,
  fmtPrice, fmtPriceFull, fmtContractDate,
  detectNewHigh, representativeArea, sparkSeries,
} from '../types';
import { smoothPath, type Pt } from '@/lib/svg-smooth';
import { buildShareImage, shareOrDownloadImage } from '@/lib/share-image';
import { buildPeakLine, buildTxShareText, pricePerPyeong, txKey } from '@/lib/tx-share-text';

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
  /** 조회 기간 (개월) — 공유 카드의 전고점 기간 캡션용 */
  months:  number;
}

/** 대표 면적 거래 → 시간축 비례 좌표 (silgga 스타일, sparkSeries 공용) */
function buildSparkline(apt: AptGroup, width: number, height: number) {
  const series = sparkSeries(apt);
  if (!series) return null;

  const prices = series.points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const pad = 5;

  const coords: Pt[] = series.points.map((p) => ({
    x: pad + p.t * (width - pad * 2),
    y: pad + (1 - (p.price - min) / span) * (height - pad * 2),
  }));

  return { coords, rising: series.rising, count: coords.length };
}

export default function AptCard({ apt, onClick, months }: AptCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  // 공유 팝오버 — 바깥 클릭 시 닫기
  useEffect(() => {
    if (!shareOpen) return;
    const onDown = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [shareOpen]);

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

  // 공유용 파생값 (공유 강화 2026-07-19) — latest 면적 기준 동일면적(±6㎡) 전고점
  const sameAsLatest  = apt.transactions.filter((t) => Math.abs(t.area - latest.area) <= 6);
  const sharePeak     = sameAsLatest.length ? Math.max(...sameAsLatest.map((t) => t.price)) : latest.price;
  const shareOthers   = sameAsLatest.filter((t) => t !== latest).map((t) => t.price);
  const sharePrevPeak = shareOthers.length ? Math.max(...shareOthers) : null;
  const sharePeakLine = buildPeakLine({
    price: latest.price, peak: sharePeak, prevPeak: sharePrevPeak, months, fmt: fmtPrice,
  });
  const sharePerPy = `평당 ${fmtPrice(pricePerPyeong(latest.price, latest.area))}`;
  // 딥링크 — 받은 사람이 이 계약 건으로 정확히 착지 (months·tx 포함)
  const shareUrl = () =>
    `${window.location.origin}/transactions?district=${encodeURIComponent(apt.district)}` +
    `&q=${encodeURIComponent(apt.name)}&months=${months}&tx=${encodeURIComponent(txKey(latest))}`;

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

  // 이미지 공유 — 브랜드 실거래 카드 PNG (모바일 네이티브 공유 / 데스크톱 다운로드)
  const shareImage = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      // 대표 면적 거래열 → 공유 카드 스파크라인(0~100 × 0~56) + 최근 등락
      const series = sparkSeries(apt);
      let sparkPts: Pt[] = [];
      let delta = '';
      let up = false;
      if (series && series.points.length > 1) {
        const prices = series.points.map((p) => p.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const span = max - min || 1;
        sparkPts = series.points.map((p) => ({ x: p.t * 100, y: (1 - (p.price - min) / span) * 56 }));
        const diff = prices[prices.length - 1] - prices[prices.length - 2];
        up = diff >= 0;
        if (diff !== 0) delta = `${up ? '▲' : '▼'} ${fmtPrice(Math.abs(diff))}`;
      }

      const blob = await buildShareImage({
        apt:      apt.name,
        location: apt.dong ? `${apt.district} ${apt.dong}` : apt.district,
        price:    fmtPrice(latest.price),
        delta,
        up,
        meta:     `${latest.area}㎡ · ${Math.round(latest.area / 3.3058)}평 · ${latest.floor}층 · ${fmtContractDate(latest.date)} 계약`,
        spark:    sparkPts,
        high:     newHigh,
        pricePerPy: sharePerPy,
        peakLine:   sharePeakLine,
      });
      if (!blob) return;
      await shareOrDownloadImage(blob, `${apt.name}-실거래.png`, apt.name);
      setShareOpen(false);
    } catch {
      // 공유 취소 등은 무시
    }
  };

  // 링크 공유 — 텍스트+URL (모바일 네이티브 공유 시트 → 카톡 링크카드 / 데스크톱 클립보드)
  const shareLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = shareUrl();
    const text = buildTxShareText({
      aptName: apt.name,
      location: apt.dong ? `${apt.district} ${apt.dong}` : apt.district,
      price: latest.price, areaM2: latest.area, floor: latest.floor, date: latest.date,
      peakLine: sharePeakLine, fmt: fmtPrice, fmtDate: fmtContractDate,
    });
    try {
      if (navigator.share) {
        await navigator.share({ title: apt.name, text, url });
        setShareOpen(false);
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setCopied(true);
        setTimeout(() => { setCopied(false); setShareOpen(false); }, 1400);
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
              <path
                d={spark.count >= 5
                  ? `M${spark.coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' L')}`
                  : smoothPath(spark.coords)}
                fill="none"
                stroke="#3D4E6E"
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle
                cx={spark.coords[spark.coords.length - 1].x}
                cy={spark.coords[spark.coords.length - 1].y}
                r="2.6"
                fill="#3D4E6E"
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
        <div
          ref={shareRef}
          style={{ position: 'relative', flexShrink: 0 }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShareOpen((v) => !v); }}
            aria-label={`${apt.name} 공유`}
            aria-expanded={shareOpen}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
          >
            <Share2 size={13} />
            공유
          </button>

          {shareOpen && (
            <div style={{
              position: 'absolute', right: 0, bottom: 'calc(100% + 8px)', zIndex: 20,
              minWidth: '152px', display: 'flex', flexDirection: 'column',
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '10px', boxShadow: '0 10px 28px rgba(20,33,61,0.14)', padding: '6px',
            }}>
              <button
                onClick={shareImage}
                style={{
                  textAlign: 'left', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)',
                  padding: '8px 10px', borderRadius: '7px', background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                🖼 이미지로 공유
              </button>
              <button
                onClick={shareLink}
                style={{
                  textAlign: 'left', fontSize: '12.5px', fontWeight: 600,
                  color: copied ? 'var(--success-text, #2E7A4C)' : 'var(--text-primary)',
                  padding: '8px 10px', borderRadius: '7px', background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                {copied ? '✓ 링크 복사됨' : '🔗 링크 공유'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
