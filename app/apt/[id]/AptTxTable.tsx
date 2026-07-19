'use client';

import { Fragment, useState } from 'react';
import {
  type AptGroup, type Transaction,
  fmtPrice, fmtPriceFull, fmtContractDate, buildSparkPts,
} from '@/lib/tx-shared';
import { buildShareImage, shareOrDownloadImage } from '@/lib/share-image';
import { buildPeakLine, buildTxShareText, pricePerPyeong, txKey } from '@/lib/tx-share-text';

/**
 * 단지 페이지 거래 테이블 — 클라이언트 전환 (2026-07-19).
 *
 * 기존 서버 렌더 테이블을 모달과 대칭인 인터랙티브 테이블로:
 * 행 클릭 → 계약 건별 상세 아코디언(평당·고점대비·직전 대비) + 이미지·텍스트
 * 공유(실거래 조회 딥링크 착지). 평당가는 진짜 평 기준(㎡당 오표기 정정).
 */

interface AptTxTableProps {
  aptName:  string;
  district: string;
  dong:     string | null;
  /** 전체 거래 (계약일 역순) — 파생값(전고점 등)은 전체 기준, 표시는 limit 행 */
  transactions: Transaction[];
  months:   number;
  maxPrice: number;
  limit:    number;
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px', fontSize: '11px', fontWeight: 700,
  color: 'var(--text-strong)', textAlign: 'left', whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: '11px 14px', fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap',
};

export default function AptTxTable({
  aptName, district, dong, transactions, months, maxPrice, limit,
}: AptTxTableProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [txCopied,    setTxCopied]    = useState(false);
  const [txSaving,    setTxSaving]    = useState(false);

  const displayed = transactions.slice(0, limit);
  const location  = dong ? `${district} ${dong}` : district;

  const txDerived = (tx: Transaction) => {
    const sameArea = transactions.filter((t) => Math.abs(t.area - tx.area) <= 6);
    const peak     = sameArea.length ? Math.max(...sameArea.map((t) => t.price)) : tx.price;
    const others   = sameArea.filter((t) => t !== tx).map((t) => t.price);
    const prevPeak = others.length ? Math.max(...others) : null;
    const idx  = transactions.indexOf(tx);
    const prev = idx >= 0 ? transactions.slice(idx + 1).find((t) => Math.abs(t.area - tx.area) <= 6) ?? null : null;
    return {
      sameArea, peak, prev,
      peakLine: buildPeakLine({ price: tx.price, peak, prevPeak, months, fmt: fmtPrice }),
      perPy:    pricePerPyeong(tx.price, tx.area),
      isPeak:   tx.price >= peak,
    };
  };

  const deepLinkUrl = (tx: Transaction) =>
    `${window.location.origin}/transactions?district=${encodeURIComponent(district)}` +
    `&q=${encodeURIComponent(aptName)}&months=${months}&tx=${encodeURIComponent(txKey(tx))}`;

  const shareTxImage = async (tx: Transaction) => {
    if (txSaving) return;
    setTxSaving(true);
    try {
      const d = txDerived(tx);
      const delta = d.prev ? tx.price - d.prev.price : null;
      const fakeGroup: AptGroup = {
        id: aptName, name: aptName, district, dong, areas: [], transactions: d.sameArea,
      };
      const spark = buildSparkPts(fakeGroup);
      const blob = await buildShareImage({
        apt: aptName,
        location,
        price: fmtPrice(tx.price),
        delta: delta !== null && delta !== 0 ? `${delta > 0 ? '▲' : '▼'} ${fmtPrice(Math.abs(delta))}` : '',
        up: delta !== null ? delta >= 0 : true,
        meta: `${tx.area}㎡ · ${Math.round(tx.area / 3.3058)}평 · ${tx.floor}층 · ${fmtContractDate(tx.date)} 계약`,
        spark: spark?.pts ?? [],
        high: d.isPeak && d.sameArea.length >= 2,
        pricePerPy: `평당 ${fmtPrice(d.perPy)}`,
        peakLine: d.peakLine,
      });
      if (blob) await shareOrDownloadImage(blob, `${aptName}-${tx.date}-실거래.png`, aptName);
    } catch { /* 공유 취소 무시 */ }
    setTxSaving(false);
  };

  const shareTxText = async (tx: Transaction) => {
    const d = txDerived(tx);
    const text = buildTxShareText({
      aptName, location,
      price: tx.price, areaM2: tx.area, floor: tx.floor, date: tx.date,
      peakLine: d.peakLine, fmt: fmtPrice, fmtDate: fmtContractDate,
    });
    const url = deepLinkUrl(tx);
    try {
      if (navigator.share) {
        await navigator.share({ title: aptName, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setTxCopied(true);
        setTimeout(() => setTxCopied(false), 1500);
      }
    } catch { /* 공유 취소 무시 */ }
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            {['계약일', '면적', '층', '거래가', '평당가'].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayed.map((tx, i) => {
            const isMax = maxPrice > 0 && tx.price === maxPrice &&
              i === displayed.findIndex((t) => t.price === maxPrice);
            const isOpen = expandedIdx === i;
            const d = isOpen ? txDerived(tx) : null;
            const prevDelta = d?.prev ? tx.price - d.prev.price : null;
            const ratio = maxPrice > 0 ? (tx.price / maxPrice) * 100 : null;
            return (
              <Fragment key={i}>
              <tr
                onClick={() => setExpandedIdx(isOpen ? null : i)}
                style={{
                  borderTop: '1px solid var(--border-light)', cursor: 'pointer',
                  backgroundColor: isOpen ? 'rgba(27,77,219,0.06)' : undefined,
                }}
                onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.backgroundColor = 'rgba(27,77,219,0.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isOpen ? 'rgba(27,77,219,0.06)' : ''; }}
              >
                <td style={tdStyle}>{fmtContractDate(tx.date)}</td>
                <td style={tdStyle}>{tx.area}㎡ · {Math.round(tx.area / 3.3058)}평</td>
                <td style={tdStyle}>{tx.floor}층</td>
                <td style={{
                  ...tdStyle, fontWeight: 700, fontFamily: 'Roboto Mono, monospace',
                  color: isMax ? 'var(--up-color, #C92F2F)' : 'var(--text-primary)',
                }}>
                  {fmtPriceFull(tx.price)}
                </td>
                <td style={{ ...tdStyle, fontSize: '12px', fontFamily: 'Roboto Mono, monospace', color: 'var(--text-dim)' }}>
                  {/* 진짜 평당가 — pricePerArea 는 ㎡당 값이라 /평 표기가 3.3배 틀렸음 (정정) */}
                  {fmtPrice(pricePerPyeong(tx.price, tx.area))}/평
                </td>
              </tr>

              {isOpen && d && (
                <tr style={{ backgroundColor: 'rgba(27,77,219,0.04)' }}>
                  <td colSpan={5} style={{ padding: '14px 16px 16px', borderTop: '1px dashed var(--border)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12.5px', color: 'var(--text-muted)' }}>
                        <span>거래가 <strong style={{ color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{fmtPrice(tx.price)}</strong></span>
                        <span>평당 <strong style={{ color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{fmtPrice(d.perPy)}</strong></span>
                        {ratio !== null && <span>고점대비 <strong style={{ color: ratio >= 100 ? 'var(--up-color, #C92F2F)' : 'var(--text-primary)' }}>{ratio.toFixed(1)}%</strong></span>}
                        <span>
                          직전 동일면적 대비{' '}
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
  );
}
