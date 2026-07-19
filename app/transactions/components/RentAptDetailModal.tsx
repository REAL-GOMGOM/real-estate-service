'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { fmtPrice, fmtContractDate, type Transaction } from '../types';
import { type RentAptGroup, type RentTransaction, fmtRentPrice, buildRentShareCard, isJeonse } from '@/lib/rent-shared';
import { buildShareImage, shareOrDownloadImage } from '@/lib/share-image';
import { pricePerPyeong } from '@/lib/tx-share-text';
import { rentTxKey, buildRentPeakLine, buildRentTxShareText } from '@/lib/rent-share-text';
import PriceComboChart from '@/components/apt/PriceComboChart';

/**
 * 전월세 상세 모달 — 전월세 v2 (매매 AptDetailModal 미러).
 *
 * 카드 클릭 → 면적 필터 + 통계(보증금·갱신 인상률) + 보증금 추이 차트 + 거래 테이블.
 * 보증금(만원) 기준 표기·차트. 월세는 보증금/월세 병기.
 * 열림 중 배경 스크롤 잠금 + Esc 닫기 (AptDetailModal 과 동일 UX).
 */

interface RentAptDetailModalProps {
  apt:     RentAptGroup;
  onClose: () => void;
  months:  number;
  /** 딥링크 착지 — 공유 URL 의 rtx 식별자 (해당 계약 행 자동 확장·스크롤) */
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

/** 갱신 계약의 보증금 인상률 % — 종전 보증금 대비. 갱신 아님·종전값 없으면 null */
function renewalDepositPct(tx: RentTransaction): number | null {
  if (tx.contractType !== '갱신' || !tx.prevDeposit || tx.prevDeposit <= 0) return null;
  return Math.round(((tx.deposit - tx.prevDeposit) / tx.prevDeposit) * 1000) / 10;
}

export default function RentAptDetailModal({ apt, onClose, months, initialTx }: RentAptDetailModalProps) {
  const [selArea, setSelArea] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [imageSaving, setImageSaving] = useState(false);
  // 계약 건별 아코디언 (전월세 대칭 2026-07-19)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [txCopied,    setTxCopied]    = useState(false);
  const [txSaving,    setTxSaving]    = useState(false);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // 모달 열림 중 배경 페이지 스크롤 잠금 + Esc 닫기
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

  const sorted = useMemo(
    () => [...apt.transactions].sort((a, b) => b.date.localeCompare(a.date)),
    [apt.transactions],
  );
  const uniqueAreas = useMemo(
    () => [...new Set(apt.transactions.map((t) => t.area))].sort((a, b) => a - b),
    [apt.transactions],
  );

  const filtered = selArea !== null
    ? sorted.filter((t) => Math.abs(t.area - selArea) <= 6)
    : sorted;

  const latest     = filtered[0];
  const avgDeposit = filtered.length ? Math.round(filtered.reduce((s, t) => s + t.deposit, 0) / filtered.length) : 0;
  const maxDeposit = filtered.reduce((m, t) => Math.max(m, t.deposit), 0);

  // 갱신 평균 보증금 인상률 — 종전 보증금이 신고된 갱신 계약만 (면적 필터 연동)
  const renewalPcts = filtered.map(renewalDepositPct).filter((v): v is number => v !== null);
  const avgRenewalPct = renewalPcts.length
    ? Math.round((renewalPcts.reduce((s, v) => s + v, 0) / renewalPcts.length) * 10) / 10
    : null;

  // ── 계약 건별 파생값 (전월세 대칭 2026-07-19) ──
  // 전세: 보증금 기준 평당·기간 내 최고 보증금. 월세: 2차원 가격이라 최고가 라인 생략.
  const rentTxDerived = (tx: RentTransaction) => {
    const jeonse = isJeonse(tx);
    const sameGroup = filtered.filter((t) => isJeonse(t) === jeonse && Math.abs(t.area - tx.area) <= 6);
    const peak     = jeonse && sameGroup.length ? Math.max(...sameGroup.map((t) => t.deposit)) : 0;
    const others   = sameGroup.filter((t) => t !== tx).map((t) => t.deposit);
    const prevPeak = jeonse && others.length ? Math.max(...others) : null;
    const idx  = filtered.indexOf(tx);
    const prev = idx >= 0
      ? filtered.slice(idx + 1).find((t) => isJeonse(t) === jeonse && Math.abs(t.area - tx.area) <= 6) ?? null
      : null;
    return {
      jeonse, prev,
      peakLine: jeonse ? buildRentPeakLine({ deposit: tx.deposit, peak, prevPeak, months, fmt: fmtPrice }) : '',
      perPy:    jeonse ? pricePerPyeong(tx.deposit, tx.area) : null,
    };
  };

  const deepLinkUrl = (tx: RentTransaction) =>
    `${window.location.origin}/transactions?district=${encodeURIComponent(apt.district)}` +
    `&q=${encodeURIComponent(apt.name)}&months=${months}` +
    `&dealType=${isJeonse(tx) ? 'jeonse' : 'monthly'}&rtx=${encodeURIComponent(rentTxKey(tx))}`;

  // 건별 이미지 공유 — 그 계약 건을 헤드로 한 카드 (기존 buildRentShareCard 재사용)
  const shareTxImage = async (tx: RentTransaction) => {
    if (txSaving) return;
    setTxSaving(true);
    try {
      const data = buildRentShareCard({
        aptName: apt.name, district: apt.district, dong: apt.dong,
        filtered: [tx, ...filtered.filter((t) => t !== tx)],
        fmt: fmtPrice, fmtDate: fmtContractDate,
      });
      if (data) {
        const d = rentTxDerived(tx);
        const blob = await buildShareImage({
          ...data,
          pricePerPy: d.perPy ? `평당 보증금 ${fmtPrice(d.perPy)}` : undefined,
          peakLine:   d.peakLine || undefined,
        });
        if (blob) await shareOrDownloadImage(blob, `${apt.name}-${tx.date}-전월세.png`, apt.name);
      }
    } catch { /* 공유 취소 무시 */ }
    setTxSaving(false);
  };

  // 건별 텍스트 공유 — dealType 탭까지 복원되는 딥링크 포함
  const shareTxText = async (tx: RentTransaction) => {
    const d = rentTxDerived(tx);
    const text = buildRentTxShareText({
      aptName: apt.name,
      location: `${apt.district}${apt.dong ? ' ' + apt.dong : ''}`,
      tx, peakLine: d.peakLine, fmt: fmtPrice, fmtDate: fmtContractDate,
    });
    const url = deepLinkUrl(tx);
    try {
      if (navigator.share) {
        await navigator.share({ title: apt.name, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setTxCopied(true);
        setTimeout(() => setTxCopied(false), 1500);
      }
    } catch { /* 공유 취소 무시 */ }
  };

  // 딥링크 착지 — initialTx(rtx) 매칭 행 자동 확장 + 중앙 스크롤
  useEffect(() => {
    if (!initialTx) return;
    const idx = sorted.findIndex((t) => rentTxKey(t) === initialTx);
    if (idx < 0) return;
    setExpandedIdx(idx);
    requestAnimationFrame(() => {
      rowRefs.current.get(idx)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTx]);

  // 보증금 추이 차트 — 매매 공용 PriceComboChart 에 보증금을 price 로 어댑트 (월세도 보증금 기준)
  const chartTx: Transaction[] = filtered.map((t) => ({
    aptName: apt.name, district: apt.district,
    area: t.area, floor: t.floor,
    price: t.deposit, pricePerArea: 0, date: t.date,
  }));

  // 이미지 공유 — 현재 면적 필터 상태의 브랜드 카드 생성 (매매 AptDetailModal 과 대칭)
  const saveAsImage = async () => {
    if (!latest || imageSaving) return;
    setImageSaving(true);
    try {
      const data = buildRentShareCard({
        aptName: apt.name,
        district: apt.district,
        dong: apt.dong,
        filtered,
        fmt: fmtPrice,
        fmtDate: fmtContractDate,
      });
      if (data) {
        const blob = await buildShareImage(data);
        if (blob) await shareOrDownloadImage(blob, `${apt.name}-전월세.png`, apt.name);
      }
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
              {latest && (
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
                  backgroundColor: latest.monthlyRent === 0 ? '#EAF3FF' : 'var(--border-light)',
                  color: latest.monthlyRent === 0 ? '#1B4DDB' : 'var(--text-dim)',
                }}>
                  {latest.monthlyRent === 0 ? '전세' : '월세'}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
              {apt.district}{apt.dong ? ` ${apt.dong}` : ''}
              {apt.buildYear ? ` · ${apt.buildYear}년 입주` : ''}
              {' · '}{(apt.txCount ?? apt.transactions.length).toLocaleString()}건
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

        {/* 통계 카드 4개 — 보증금 기준 + 갱신 평균 인상률 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', padding: '0 24px 20px' }}>
          <StatCard
            label="최근 계약"
            value={latest ? fmtRentPrice(latest, fmtPrice) : '—'}
            sub={latest ? fmtContractDate(latest.date) : undefined}
          />
          <StatCard label={`${months}개월 평균 보증금`} value={filtered.length ? fmtPrice(avgDeposit) : '—'} />
          <StatCard label="최고 보증금" value={maxDeposit > 0 ? fmtPrice(maxDeposit) : '—'} />
          <StatCard
            label="갱신 평균 인상률"
            value={avgRenewalPct !== null ? `${avgRenewalPct > 0 ? '+' : ''}${avgRenewalPct}%` : '—'}
            sub={renewalPcts.length ? `갱신 ${renewalPcts.length}건 평균` : '종전 보증금 신고분 없음'}
          />
        </div>

        {/* 보증금 추이 차트 — 월평균 라인 + 개별 거래 도트 (공용 PriceComboChart) */}
        {chartTx.length > 1 && (
          <div style={{ padding: '0 24px 20px' }}>
            <PriceComboChart transactions={chartTx} maxPrice={maxDeposit} />
          </div>
        )}

        {/* 거래 내역 테이블 */}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                {['계약일', '면적', '층', '보증금/월세', '구분', '인상률'].map((h) => (
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
                const pct = renewalDepositPct(tx);
                const isOpen = expandedIdx === i;
                const d = isOpen ? rentTxDerived(tx) : null;
                const depositDelta = d?.prev ? tx.deposit - d.prev.deposit : null;
                const monthlyDelta = d?.prev ? tx.monthlyRent - d.prev.monthlyRent : null;
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
                      color: 'var(--text-primary)',
                      fontFamily: 'Roboto Mono, monospace', whiteSpace: 'nowrap',
                    }}>
                      {fmtRentPrice(tx, fmtPrice)}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {tx.contractType ? (
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '5px',
                          backgroundColor: tx.contractType === '갱신' ? 'var(--border-light)' : '#EAF3FF',
                          color: tx.contractType === '갱신' ? 'var(--text-dim)' : '#1B4DDB',
                        }}>
                          {tx.contractType}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-dim)' }}>—</span>
                      )}
                    </td>
                    <td style={{
                      padding: '11px 12px', fontSize: '12px', whiteSpace: 'nowrap',
                      fontFamily: 'Roboto Mono, monospace',
                      color: pct === null ? 'var(--text-dim)' : pct > 0 ? 'var(--up-color, #C92F2F)' : pct < 0 ? 'var(--accent)' : 'var(--text-dim)',
                    }}>
                      {pct !== null ? `${pct > 0 ? '+' : ''}${pct}%` : '—'}
                    </td>
                  </tr>

                  {/* 계약 건별 상세 아코디언 (전월세 대칭 2026-07-19) */}
                  {isOpen && d && (
                    <tr style={{ backgroundColor: 'rgba(27,77,219,0.04)' }}>
                      <td colSpan={6} style={{ padding: '14px 16px 16px', borderTop: '1px dashed var(--border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                            <span>{d.jeonse ? '전세' : '월세'} <strong style={{ color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{fmtRentPrice(tx, fmtPrice)}</strong></span>
                            {d.perPy !== null && (
                              <span>평당 보증금 <strong style={{ color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{fmtPrice(d.perPy)}</strong></span>
                            )}
                            <span>
                              직전 동일조건 대비{' '}
                              {depositDelta !== null ? (
                                <strong style={{ color: depositDelta >= 0 ? 'var(--up-color, #C92F2F)' : '#1636A8' }}>
                                  {depositDelta === 0 ? '보증금 보합' : `보증금 ${depositDelta > 0 ? '▲' : '▼'} ${fmtPrice(Math.abs(depositDelta))}`}
                                  {!d.jeonse && monthlyDelta !== null && monthlyDelta !== 0
                                    ? ` · 월세 ${monthlyDelta > 0 ? '+' : ''}${monthlyDelta}만`
                                    : ''}
                                </strong>
                              ) : (
                                <span style={{ color: 'var(--text-dim)' }}>비교 대상 없음</span>
                              )}
                            </span>
                            {tx.contractType === '갱신' && tx.prevDeposit ? (
                              <span>갱신 · 종전 <strong style={{ color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>
                                {fmtRentPrice({ deposit: tx.prevDeposit, monthlyRent: tx.prevMonthlyRent ?? 0 }, fmtPrice)}
                              </strong></span>
                            ) : null}
                          </div>
                          {d.peakLine && <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: 0 }}>{d.peakLine}</p>}
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

        {/* 하단 액션 — 네이버 지도 + 링크 공유 */}
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
                const url = latest
                  ? deepLinkUrl(latest)
                  : `${window.location.origin}/transactions?district=${encodeURIComponent(apt.district)}&q=${encodeURIComponent(apt.name)}`;
                const text = latest
                  ? buildRentTxShareText({
                      aptName: apt.name,
                      location: `${apt.district}${apt.dong ? ' ' + apt.dong : ''}`,
                      tx: latest, peakLine: rentTxDerived(latest).peakLine,
                      fmt: fmtPrice, fmtDate: fmtContractDate,
                    })
                  : `${apt.name} · 내집 My.ZIP`;
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
