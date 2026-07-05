'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import {
  type AptGroup, type Transaction,
  fmtPrice, fmtContractDate, detectNewHigh, buildSparkPts,
} from '../types';
import { buildShareImage, shareOrDownloadImage } from '@/lib/share-image';
import PriceComboChart from '@/components/apt/PriceComboChart';

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

export default function AptDetailModal({ apt, onClose, months }: AptDetailModalProps) {
  const [selArea, setSelArea] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);

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

  // 이미지 공유 (사이클 CC-2) — 현재 면적 필터 상태의 브랜드 카드 생성
  const saveAsImage = async () => {
    if (!latest || imageSaving) return;
    setImageSaving(true);
    try {
      // 직전 동일 면적(±6㎡) 거래 대비 등락
      const prev = filtered.find((t) => t !== latest && Math.abs(t.area - latest.area) <= 6) ?? null;
      const delta = prev ? latest.price - prev.price : null;
      const spark = buildSparkPts({ ...apt, transactions: filtered });

      const blob = await buildShareImage({
        apt: apt.name,
        location: `${apt.district}${apt.dong ? ' ' + apt.dong : ''}`,
        price: fmtPrice(latest.price),
        delta: delta !== null && delta !== 0 ? `${delta > 0 ? '▲' : '▼'} ${fmtPrice(Math.abs(delta))}` : '',
        up: delta !== null ? delta >= 0 : true,
        meta: `${latest.area}㎡ · ${Math.round(latest.area / 3.3058)}평 · ${latest.floor}층 · ${fmtContractDate(latest.date)} 계약`,
        spark: spark?.pts ?? [],
        high: newHigh,
      });
      if (blob) await shareOrDownloadImage(blob, `${apt.name}-실거래.png`, apt.name);
    } catch { /* 공유 취소 무시 */ }
    setImageSaving(false);
  };

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{apt.name}</h2>
              {newHigh && (
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
                  backgroundColor: 'var(--up-color, #C92F2F)', color: '#FFFFFF',
                }}>
                  신고가
                </span>
              )}
              {apt.masterId && (
                <Link
                  href={`/apt/${encodeURIComponent(apt.masterId)}`}
                  style={{
                    fontSize: '11.5px', fontWeight: 700, color: 'var(--accent)',
                    border: '1px solid var(--border)', padding: '3px 9px',
                    borderRadius: '6px', textDecoration: 'none', whiteSpace: 'nowrap',
                  }}
                >
                  단지 페이지 ↗
                </Link>
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

        {/* 가격 차트 — 월평균 라인 + 개별 거래 도트 (공용 PriceComboChart) */}
        {filtered.length > 1 && (
          <div style={{ padding: '0 24px 20px' }}>
            <PriceComboChart transactions={filtered} maxPrice={maxPrice} />
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
          <div style={{ display: 'flex', gap: '9px' }}>
            <button
              onClick={saveAsImage}
              disabled={imageSaving || !latest}
              style={{
                flex: 1, backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', fontWeight: 800, fontSize: '14px',
                padding: '14px', borderRadius: '12px',
                cursor: imageSaving ? 'wait' : 'pointer', fontFamily: 'inherit',
                opacity: imageSaving ? 0.6 : 1,
              }}
            >
              {imageSaving ? '생성 중…' : '🖼 이미지로 공유'}
            </button>
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
                flex: 1, border: 0, backgroundColor: 'var(--accent)', color: '#FFFFFF',
                fontWeight: 800, fontSize: '14px', padding: '14px', borderRadius: '12px',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {shareCopied ? '✓ 링크 복사됨' : '↗ 공유하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
