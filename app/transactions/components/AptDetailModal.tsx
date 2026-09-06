'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import {
  type AptGroup, type Transaction,
  fmtPrice, fmtContractDate, buildSparkPts, scoreGradeLabel,
} from '../types';
import { buildShareImage, shareOrDownloadImage } from '@/lib/share-image';
import { buildTxShareText, pricePerPyeong, txKey, fmtMonthsLabel, PARTIAL_TRANSACTION_NOTICE } from '@/lib/tx-share-text';
import { buildTransactionShareUrl } from '@/lib/transaction-share-url';
import { analyzeTransactionPrice, formatTransactionComparisonLine } from '@/lib/transaction-price-comparison';
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
  dealType?: 'buy' | 'bunyang';
  dataComplete?: boolean;
  /** 딥링크 착지 — 공유 URL 의 tx 식별자 (해당 계약 행 자동 확장·스크롤) */
  initialTx?: string | null;
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

export default function AptDetailModal({ apt, onClose, months, initialTx, dealType = 'buy', dataComplete = true }: AptDetailModalProps) {
  const [selArea, setSelArea] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);
  // 계약 건별 아코디언 (공유 강화 2026-07-19)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [txCopied,    setTxCopied]    = useState(false);
  const [txSaving,    setTxSaving]    = useState(false);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const comparisons = useMemo(() => new Map(apt.transactions.map((transaction) => [
    transaction, analyzeTransactionPrice(apt.transactions, transaction),
  ])), [apt.transactions]);

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
  const comparison = latest ? comparisons.get(latest) ?? null : null;
  const newHigh = dataComplete && comparison?.state === 'new-high';

  // 최신 표시 거래와 유사 면적의 기간 최고가만 비교한다. 100%는 경신의 증거가 아니다.
  const recoveryPct = dataComplete && comparison && comparison.prior.length > 0 && comparison.periodPeak > 0
    ? Math.round((comparison.target.price / comparison.periodPeak) * 1000) / 10
    : null;

  // ── 계약 건별 파생값 (공유 강화 2026-07-19) ──
  const txDerived = (tx: Transaction) => {
    const analysis = comparisons.get(tx) ?? null;
    return {
      sameArea: analysis?.sameArea ?? [tx],
      prev: analysis?.previous ?? null,
      peakLine: dataComplete ? formatTransactionComparisonLine(analysis, months, fmtPrice) : PARTIAL_TRANSACTION_NOTICE,
      perPy: pricePerPyeong(tx.price, tx.area),
      isPeak: dataComplete && analysis?.state === 'new-high',
    };
  };

  const deepLinkUrl = (tx?: Transaction) => buildTransactionShareUrl({
    origin: window.location.origin, apartment: apt, months, dealType,
    tx: tx ? txKey(tx) : undefined,
  });

  // 건별 이미지 공유 — 그 계약 건 기준 카드 (동일면적 시리즈 스파크)
  const shareTxImage = async (tx: Transaction) => {
    if (txSaving) return;
    setTxSaving(true);
    try {
      const d = txDerived(tx);
      const delta = dataComplete && d.prev ? tx.price - d.prev.price : null;
      const spark = buildSparkPts({ ...apt, transactions: d.sameArea }, tx.area);
      const blob = await buildShareImage({
        apt: apt.name,
        location: `${apt.district}${apt.dong ? ' ' + apt.dong : ''}`,
        price: fmtPrice(tx.price),
        delta: delta !== null && delta !== 0 ? `${delta > 0 ? '▲' : '▼'} ${fmtPrice(Math.abs(delta))}` : '',
        up: delta !== null ? delta >= 0 : true,
        meta: `${tx.area}㎡ · ${Math.round(tx.area / 3.3058)}평 · ${tx.floor}층 · ${fmtContractDate(tx.date)} 계약`,
        spark: spark?.pts ?? [],
        high: d.isPeak,
        pricePerPy: `평당 ${fmtPrice(d.perPy)}`,
        peakLine: d.peakLine,
        dataComplete,
      });
      if (blob) await shareOrDownloadImage(blob, `${apt.name}-${tx.date}-실거래.png`, apt.name, deepLinkUrl(tx));
    } catch { /* 공유 취소 무시 */ }
    setTxSaving(false);
  };

  // 건별 텍스트 공유 — 딥링크 포함 (받은 사람이 이 계약으로 정확히 착지)
  const shareTxText = async (tx: Transaction) => {
    const d = txDerived(tx);
    const url = deepLinkUrl(tx);
    const text = buildTxShareText({
      aptName: apt.name,
      location: `${apt.district}${apt.dong ? ' ' + apt.dong : ''}`,
      url,
      price: tx.price, areaM2: tx.area, floor: tx.floor, date: tx.date,
      peakLine: d.peakLine, fmt: fmtPrice, fmtDate: fmtContractDate,
      dataComplete,
    });
    try {
      if (navigator.share) {
        await navigator.share({ title: apt.name, text });
      } else {
        await navigator.clipboard.writeText(text);
        setTxCopied(true);
        setTimeout(() => setTxCopied(false), 1500);
      }
    } catch { /* 공유 취소 무시 */ }
  };

  // 딥링크 착지 — initialTx 매칭 행 자동 확장 + 중앙 스크롤
  useEffect(() => {
    if (!initialTx) return;
    const idx = sorted.findIndex((t) => txKey(t) === initialTx);
    if (idx < 0) return;
    setExpandedIdx(idx);
    requestAnimationFrame(() => {
      rowRefs.current.get(idx)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTx]);

  // 링크·텍스트 공유 — 헤더(상단)·하단 버튼 공용 (공유 상단 배치 2026-07-19)
  const shareText = async () => {
    const url = deepLinkUrl(latest);
    const text = latest
      ? buildTxShareText({
          aptName: apt.name,
          location: `${apt.district}${apt.dong ? ' ' + apt.dong : ''}`,
          url,
          price: latest.price, areaM2: latest.area, floor: latest.floor, date: latest.date,
          peakLine: txDerived(latest).peakLine, fmt: fmtPrice, fmtDate: fmtContractDate,
          dataComplete,
        })
      : `🏠 ${apt.name} 실거래\n${dataComplete ? '' : `\nℹ️ ${PARTIAL_TRANSACTION_NOTICE}\n`}\n🔎 거래 자세히 보기\n${url}\n— 내집 My.ZIP`;
    try {
      if (navigator.share) {
        await navigator.share({ title: apt.name, text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 1500);
      }
    } catch { /* 공유 취소 무시 */ }
  };

  // 이미지 공유 (사이클 CC-2) — 현재 면적 필터 상태의 브랜드 카드 생성
  const saveAsImage = async () => {
    if (!latest || imageSaving) return;
    setImageSaving(true);
    try {
      const d = txDerived(latest);
      const prev = d.prev;
      const delta = dataComplete && prev ? latest.price - prev.price : null;
      const spark = buildSparkPts({ ...apt, transactions: d.sameArea }, latest.area);

      const blob = await buildShareImage({
        apt: apt.name,
        location: `${apt.district}${apt.dong ? ' ' + apt.dong : ''}`,
        price: fmtPrice(latest.price),
        delta: delta !== null && delta !== 0 ? `${delta > 0 ? '▲' : '▼'} ${fmtPrice(Math.abs(delta))}` : '',
        up: delta !== null ? delta >= 0 : true,
        meta: `${latest.area}㎡ · ${Math.round(latest.area / 3.3058)}평 · ${latest.floor}층 · ${fmtContractDate(latest.date)} 계약`,
        spark: spark?.pts ?? [],
        high: newHigh,
        pricePerPy: `평당 ${fmtPrice(pricePerPyeong(latest.price, latest.area))}`,
        peakLine: d.peakLine,
        dataComplete,
      });
      if (blob) await shareOrDownloadImage(blob, `${apt.name}-실거래.png`, apt.name, deepLinkUrl(latest));
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
        className="rounded-scroll"
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
              {apt.score != null && (
                <span
                  title="내집 자체 산정 입지점수 (1.0 최상) — 자세한 분석은 단지 페이지"
                  style={{
                    fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
                    backgroundColor: '#EEF2FB', color: '#1B4DDB', whiteSpace: 'nowrap',
                  }}
                >
                  입지 {apt.score.toFixed(2)} {scoreGradeLabel(apt.score)}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
              {apt.district}{apt.dong ? ` ${apt.dong}` : ''}
              {apt.buildYear ? ` · ${apt.buildYear}년 입주` : ''}
              {apt.households ? ` · ${apt.households.toLocaleString()}세대` : ''}
            </p>
            {!dataComplete && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>{PARTIAL_TRANSACTION_NOTICE}</p>}
          </div>
          {/* 상단 액션 — 공유 2종 + 닫기 (공유 상단 배치 2026-07-19, 하단 버튼도 유지) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={saveAsImage}
              disabled={imageSaving || !latest}
              aria-label="이미지로 공유"
              title="이미지로 공유"
              style={{
                padding: '6px 10px', borderRadius: '8px', fontSize: '14px',
                backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
                cursor: imageSaving ? 'wait' : 'pointer', opacity: imageSaving ? 0.6 : 1,
              }}
            >
              🖼
            </button>
            <button
              onClick={shareText}
              disabled={!latest}
              aria-label="공유하기"
              title="공유하기"
              style={{
                padding: '6px 10px', borderRadius: '8px', fontSize: '14px', fontWeight: 700,
                backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
                color: shareCopied ? 'var(--success-text, #2E7A4C)' : 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {shareCopied ? '✓' : '↗'}
            </button>
            <button
              onClick={onClose}
              aria-label="닫기"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px' }}
            >
              <X size={20} />
            </button>
          </div>
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
          <StatCard label={dataComplete ? '최근 실거래가' : '확인된 최근 실거래가'} value={latest ? fmtPrice(latest.price) : '—'} sub={latest ? `${latest.area}㎡ · ${fmtContractDate(latest.date)}` : undefined} />
          <StatCard label={dataComplete ? `${fmtMonthsLabel(months)} 평균` : '확인된 거래 평균'} value={filtered.length ? fmtPrice(avgPrice) : '—'} sub={`${selArea === null ? '전체 면적' : `${selArea}㎡ ±6㎡`} · ${dataComplete ? '' : '확인 '}${filtered.length}건`} />
          <StatCard label={dataComplete ? `${fmtMonthsLabel(months)} 최고 실거래가` : '확인된 거래 최고'} value={maxTx ? fmtPrice(maxPrice) : '—'} sub={maxTx ? `${maxTx.area}㎡ · ${fmtContractDate(maxTx.date)}` : undefined} />
          <StatCard
            label={dataComplete ? `${fmtMonthsLabel(months)} 최고가 대비` : '기간 비교 제한'}
            value={recoveryPct !== null ? `${recoveryPct}%` : '—'}
            sub={!dataComplete ? '일부 월 자료 누락' : recoveryPct !== null
              ? `${latest.area}㎡ 유사 면적(±6㎡) 기준`
              : '비교 거래 부족'}
          />
        </div>

        {/* 가격 차트 — 월평균 라인 + 개별 거래 도트 (공용 PriceComboChart) */}
        {comparison && comparison.sameArea.length > 1 && (
          <div style={{ padding: '0 24px 20px' }}>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
              {comparison.target.area}㎡ 유사 면적(±6㎡) {dataComplete ? '' : '확인된 거래 '}가격 흐름 · 조회 {fmtMonthsLabel(months)}
            </p>
            <PriceComboChart transactions={comparison.sameArea} maxPrice={comparison.periodPeak} dataComplete={dataComplete} />
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
                {['계약일', '면적', '층', '거래가', dataComplete ? '당시 고점대비' : '기간 비교 제한', '평당가'].map((h) => (
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
                const rowComparison = comparisons.get(tx);
                const ratio = dataComplete && rowComparison && rowComparison.prior.length > 0
                  ? (tx.price / rowComparison.periodPeak) * 100 : null;
                const isMax = dataComplete && rowComparison?.state === 'new-high';
                const isOpen = expandedIdx === i;
                const d = isOpen ? txDerived(tx) : null;
                const prevDelta = d?.prev ? tx.price - d.prev.price : null;
                return (
                  <Fragment key={i}>
                  <tr
                    ref={(el) => { if (el) rowRefs.current.set(i, el); }}
                    onClick={() => setExpandedIdx(isOpen ? null : i)}
                    style={{
                      borderTop: '1px solid var(--border-light)', cursor: 'pointer',
                      backgroundColor: isOpen ? 'rgba(27,77,219,0.06)' : undefined,
                    }}
                    onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.backgroundColor = 'rgba(27,77,219,0.05)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isOpen ? 'rgba(27,77,219,0.06)' : ''; }}
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
                      {/* 진짜 평당가 — 기존 pricePerArea 는 ㎡당 값이라 /평 표기가 3.3배 틀렸음 (2026-07-19 정정) */}
                      {fmtPrice(pricePerPyeong(tx.price, tx.area))}/평
                    </td>
                  </tr>

                  {/* 계약 건별 상세 아코디언 (공유 강화 2026-07-19) */}
                  {isOpen && d && (
                    <tr style={{ backgroundColor: 'rgba(27,77,219,0.04)' }}>
                      <td colSpan={6} style={{ padding: '14px 16px 16px', borderTop: '1px dashed var(--border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                            <span>거래가 <strong style={{ color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{fmtPrice(tx.price)}</strong></span>
                            <span>평당 <strong style={{ color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{fmtPrice(d.perPy)}</strong></span>
                            {ratio !== null && <span>당시 유사 면적 고점대비 <strong style={{ color: ratio >= 100 ? 'var(--up-color, #C92F2F)' : 'var(--text-primary)' }}>{ratio.toFixed(1)}%</strong></span>}
                            <span>
                              {dataComplete ? '직전 유사 면적(±6㎡) 대비' : '확인된 이전 유사 면적(±6㎡) 거래 대비'}{' '}
                              {prevDelta !== null ? (
                                <strong style={{ color: prevDelta >= 0 ? 'var(--up-color, #C92F2F)' : '#1636A8' }}>
                                  {prevDelta === 0 ? '보합' : `${prevDelta > 0 ? '▲' : '▼'} ${fmtPrice(Math.abs(prevDelta))}`}
                                </strong>
                              ) : (
                                <span style={{ color: 'var(--text-dim)' }}>비교 대상 없음</span>
                              )}
                            </span>
                          </div>
                          <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: 0 }}>{d.peakLine}</p>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); shareTxImage(tx); }}
                              disabled={txSaving}
                              style={{
                                padding: '8px 14px', borderRadius: '9px', fontSize: '12.5px', fontWeight: 700,
                                backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
                                border: '1px solid var(--border)', cursor: txSaving ? 'wait' : 'pointer',
                                opacity: txSaving ? 0.6 : 1, fontFamily: 'inherit',
                              }}
                            >
                              {txSaving ? '생성 중…' : '🖼 이미지 공유'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); shareTxText(tx); }}
                              style={{
                                padding: '8px 14px', borderRadius: '9px', fontSize: '12.5px', fontWeight: 700,
                                backgroundColor: 'var(--accent)', color: '#FFFFFF',
                                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >
                              {txCopied ? '✓ 복사됨' : '🔗 텍스트 공유'}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
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
              onClick={shareText}
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
