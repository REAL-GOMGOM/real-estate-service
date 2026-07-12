'use client';

import { useState } from 'react';
import { X, Loader2, Share2, Copy, Check } from 'lucide-react';
import type { ApartmentEntry } from '@/components/dollar/DollarPageClient';
import {
  buildRealValueInsight,
  buildRealValueShareText,
  type RealValueCardStats,
} from '@/lib/real-value-shared';
import { buildRealValueShareImage, shareOrDownloadImage } from '@/lib/share-image';

interface Props {
  entries:    ApartmentEntry[];
  baseYear:   number;
  compareYear: number;
  onRemove:   (id: string) => void;
  onAreaChange: (id: string, area: number | null) => void;
}

// ── 포맷 헬퍼 ──────────────────────────────────────
function fmtKrw(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}
function fmtUsd(manwon: number, rate: number): string {
  const usd = Math.round((manwon * 10000) / rate);
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(usd / 1000)}K`;
}
function fmtBtc(manwon: number, btcKrw: number): string {
  const btc = (manwon * 10000) / btcKrw;
  if (btc < 0.01) return `₿${btc.toFixed(4)}`;
  if (btc < 1)    return `₿${btc.toFixed(3)}`;
  if (btc < 100)  return `₿${btc.toFixed(2)}`;
  return `₿${btc.toFixed(1)}`;
}
function fmtGold(manwon: number, goldKrwPerGram: number): string {
  const g = (manwon * 10000) / goldKrwPerGram;
  if (g >= 1000) return `${(g / 1000).toFixed(2)}kg`;
  return `${Math.round(g)}g`;
}

// ── 변동률 뱃지 + 미니 바 ──────────────────────────
function ChangeBadge({ pct }: { pct: number }) {
  const up    = pct >= 0;
  const color = up ? '#2E7A4C' : '#E85D5D';
  const bg    = up ? 'rgba(74,222,128,0.12)' : 'rgba(232,93,93,0.12)';
  // 미니 바: ±150%를 풀스케일로 캡 — 방향·크기를 훑어보기용
  const fill  = Math.min(Math.abs(pct), 150) / 150 * 100;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '2px',
        padding: '3px 10px', borderRadius: '999px', fontSize: '13px', fontWeight: 700,
        fontFamily: 'Roboto Mono, monospace', color, backgroundColor: bg,
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
      </span>
      <span style={{ width: '72px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-light)', overflow: 'hidden', display: 'inline-block' }}>
        <span style={{
          display: 'block', height: '100%', borderRadius: '2px',
          width: `${fill}%`, backgroundColor: color, opacity: 0.85,
          marginLeft: 'auto',
        }} />
      </span>
    </span>
  );
}

// ── 자산별 비교 행 ─────────────────────────────────
interface RowProps {
  icon:        React.ReactNode;
  label:       string;
  accent:      string;
  baseVal:     string;
  compareVal:  string;
  pct:         number | null;
  baseYear:    number;
  compareYear: number;
  compareYtd?: boolean;
  unavailable?: boolean;
}

function AssetRow({ icon, label, accent, baseVal, compareVal, pct, baseYear, compareYear, compareYtd, unavailable }: RowProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '14px 0',
      borderBottom: '1px solid var(--border-light)',
    }}>
      {/* 자산 레이블 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        width: '64px', flexShrink: 0,
      }}>
        <span style={{
          width: '28px', height: '28px', borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 800, color: accent,
          backgroundColor: `${accent}18`, flexShrink: 0,
        }}>
          {icon}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>{label}</span>
      </div>

      {/* 기준년 값 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '2px' }}>{baseYear}년</p>
        <p style={{
          fontSize: '15px', fontWeight: 800,
          fontFamily: 'Roboto Mono, monospace', color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {baseVal}
        </p>
      </div>

      {/* 화살표 */}
      <span style={{ color: 'var(--text-dim)', fontSize: '16px', flexShrink: 0 }}>→</span>

      {/* 비교년 값 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '2px' }}>{compareYear}년{compareYtd ? ' 연중' : ''}</p>
        <p style={{
          fontSize: '15px', fontWeight: 800,
          fontFamily: 'Roboto Mono, monospace', color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {compareVal}
        </p>
      </div>

      {/* 변동률 */}
      <div style={{ flexShrink: 0, minWidth: '84px', textAlign: 'right' }}>
        {unavailable
          ? <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontStyle: 'italic' }}>해당 없음</span>
          : pct !== null ? <ChangeBadge pct={pct} /> : <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>
        }
      </div>
    </div>
  );
}

// ── 단지 카드 ──────────────────────────────────────
function DollarCard({ entry, baseYear, compareYear, onRemove, onAreaChange }: {
  entry: ApartmentEntry; baseYear: number; compareYear: number;
  onRemove: (id: string) => void; onAreaChange: (id: string, area: number | null) => void;
}) {
  const [copied,  setCopied]  = useState(false);
  const [sharing, setSharing] = useState(false);

  const {
    basePriceKrw, comparePriceKrw,
    baseExchangeRate, compareExchangeRate,
    baseBtcKrw, compareBtcKrw,
    baseGoldKrwPerGram, compareGoldKrwPerGram,
  } = entry.data!;

  const hasBase    = basePriceKrw    !== null;
  const hasCompare = comparePriceKrw !== null;

  const krwPct = hasBase && hasCompare
    ? ((comparePriceKrw! - basePriceKrw!) / basePriceKrw!) * 100 : null;

  const baseUsd    = hasBase    ? (basePriceKrw!    * 10000) / baseExchangeRate    : null;
  const compareUsd = hasCompare ? (comparePriceKrw! * 10000) / compareExchangeRate : null;
  const usdPct     = baseUsd && compareUsd ? ((compareUsd - baseUsd) / baseUsd) * 100 : null;

  const baseBtc    = (hasBase    && baseBtcKrw    !== null) ? (basePriceKrw!    * 10000) / baseBtcKrw    : null;
  const compareBtc = (hasCompare && compareBtcKrw !== null) ? (comparePriceKrw! * 10000) / compareBtcKrw : null;
  const btcPct     = baseBtc !== null && compareBtc !== null ? ((compareBtc - baseBtc) / baseBtc) * 100 : null;
  const btcUnavail = baseBtcKrw === null || compareBtcKrw === null;

  const baseGrams    = (hasBase    && baseGoldKrwPerGram    !== null) ? (basePriceKrw!    * 10000) / baseGoldKrwPerGram    : null;
  const compareGrams = (hasCompare && compareGoldKrwPerGram !== null) ? (comparePriceKrw! * 10000) / compareGoldKrwPerGram : null;
  const goldPct      = baseGrams !== null && compareGrams !== null ? ((compareGrams - baseGrams) / baseGrams) * 100 : null;

  // 공유·해석용 스탯 (표시 포맷 그대로)
  const stats: RealValueCardStats = {
    aptName: entry.aptName, district: entry.district,
    baseYear, compareYear,
    krwPct, usdPct, btcPct, goldPct,
    krwBase:  hasBase    ? fmtKrw(basePriceKrw!)    : undefined,
    krwCompare: hasCompare ? fmtKrw(comparePriceKrw!) : undefined,
    usdBase:  baseUsd    !== null ? fmtUsd(basePriceKrw!,    baseExchangeRate)    : undefined,
    usdCompare: compareUsd !== null ? fmtUsd(comparePriceKrw!, compareExchangeRate) : undefined,
    btcBase:  baseBtc    !== null ? fmtBtc(basePriceKrw!,    baseBtcKrw!)    : undefined,
    btcCompare: compareBtc !== null ? fmtBtc(comparePriceKrw!, compareBtcKrw!) : undefined,
    goldBase: baseGrams  !== null ? fmtGold(basePriceKrw!,   baseGoldKrwPerGram!)    : undefined,
    goldCompare: compareGrams !== null ? fmtGold(comparePriceKrw!, compareGoldKrwPerGram!) : undefined,
  };
  const insight = buildRealValueInsight(stats);
  const noData  = krwPct === null;

  async function handleCopyText() {
    try {
      await navigator.clipboard.writeText(buildRealValueShareText(stats));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* 클립보드 미지원 무시 */ }
  }

  async function handleShareImage() {
    if (sharing || noData) return;
    setSharing(true);
    try {
      const rows = [
        { icon: '₩',  label: '원화', accent: '#94A3B8', baseVal: stats.krwBase ?? '—',  compareVal: stats.krwCompare ?? '—',  pct: krwPct },
        { icon: '$',  label: '달러', accent: '#D9A514', baseVal: stats.usdBase ?? '—',  compareVal: stats.usdCompare ?? '—',  pct: usdPct },
        { icon: '₿',  label: '비트', accent: '#F0A24B', baseVal: stats.btcBase ?? '—',  compareVal: stats.btcCompare ?? '—',  pct: btcPct },
        { icon: 'Au', label: '금',   accent: '#C9A227', baseVal: stats.goldBase ?? '—', compareVal: stats.goldCompare ?? '—', pct: goldPct },
      ].filter((r) => r.baseVal !== '—' || r.compareVal !== '—');
      const blob = await buildRealValueShareImage({
        apt: entry.aptName, district: entry.district,
        baseYear, compareYear, rows, insight,
      });
      if (blob) {
        await shareOrDownloadImage(blob, `내집_실질가치_${entry.aptName}.png`, `${entry.aptName} 실질 가치 비교`);
      }
    } catch { /* 사용자 공유 취소 등 무시 */ }
    finally { setSharing(false); }
  }

  const shareBtnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '7px 14px', borderRadius: '9px', fontSize: '12px', fontWeight: 600,
    color: 'var(--text-secondary)', backgroundColor: 'var(--bg-overlay)',
    border: '1px solid var(--border)', cursor: 'pointer',
  };

  return (
    <div style={{
      padding: '22px 24px', borderRadius: '18px',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* 카드 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div>
          <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{entry.aptName}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginLeft: '8px' }}>
            {entry.district}{entry.area != null ? ` · 전용 ${entry.area}㎡` : ''}
          </span>
        </div>
        <button onClick={() => onRemove(entry.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px', flexShrink: 0 }}>
          <X size={15} />
        </button>
      </div>

      {/* 해석 문장 — 숫자에서 스토리로 */}
      {insight && (
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'flex-start',
          padding: '10px 14px', borderRadius: '10px', margin: '8px 0 4px',
          backgroundColor: 'var(--accent-bg)', border: '1px solid var(--border-light)',
        }}>
          <span style={{ fontSize: '13px', flexShrink: 0 }}>💡</span>
          <p style={{ fontSize: '12.5px', lineHeight: 1.55, color: 'var(--text-secondary)', margin: 0 }}>
            {insight}
          </p>
        </div>
      )}

      {/* 데이터 없음 안내 */}
      {noData && (
        <div style={{
          padding: '10px 14px', borderRadius: '10px', margin: '8px 0 4px',
          backgroundColor: 'var(--bg-overlay)', border: '1px dashed var(--border)',
          fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.55,
        }}>
          ℹ️ {baseYear}년 또는 {compareYear}년에 이 단지의 실거래(Q4 평균)가 없어 비교할 수 없어요.
          위에서 <b>기준·비교 연도를 바꿔보세요</b>.
        </div>
      )}

      {/* 평형 선택 칩 — 전 평형 통합 평균의 왜곡 해소 (2026-07-12) */}
      {(entry.data!.availableAreas?.length ?? 0) > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 4px' }}>
          <button
            onClick={() => onAreaChange(entry.id, null)}
            style={{
              padding: '4px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
              fontWeight: entry.area == null ? 700 : 500,
              color: entry.area == null ? '#fff' : 'var(--text-dim)',
              backgroundColor: entry.area == null ? 'var(--accent)' : 'var(--bg-overlay)',
              border: '1px solid ' + (entry.area == null ? 'var(--accent)' : 'var(--border)'),
            }}
          >
            전체
          </button>
          {entry.data!.availableAreas!.map((a) => (
            <button
              key={a.area}
              onClick={() => onAreaChange(entry.id, a.area)}
              style={{
                padding: '4px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                fontWeight: entry.area === a.area ? 700 : 500,
                color: entry.area === a.area ? '#fff' : 'var(--text-secondary)',
                backgroundColor: entry.area === a.area ? 'var(--accent)' : 'var(--bg-overlay)',
                border: '1px solid ' + (entry.area === a.area ? 'var(--accent)' : 'var(--border)'),
              }}
            >
              {a.area}㎡{a.count > 0 ? ` · ${a.count}건` : ''}
            </button>
          ))}
        </div>
      )}

      {/* 자산별 비교 행 */}
      <AssetRow
        icon="₩" label="원화" accent="#94A3B8"
        baseVal={hasBase    ? fmtKrw(basePriceKrw!)    : '—'}
        compareVal={hasCompare ? fmtKrw(comparePriceKrw!) : '—'}
        pct={krwPct}
        baseYear={baseYear} compareYear={compareYear} compareYtd={entry.data!.compareIsYtd}
      />
      <AssetRow
        icon="$" label="달러" accent="#FCD34D"
        baseVal={baseUsd    ? fmtUsd(basePriceKrw!,    baseExchangeRate)    : '—'}
        compareVal={compareUsd ? fmtUsd(comparePriceKrw!, compareExchangeRate) : '—'}
        pct={usdPct}
        baseYear={baseYear} compareYear={compareYear} compareYtd={entry.data!.compareIsYtd}
      />
      <AssetRow
        icon="₿" label="비트" accent="#F0A24B"
        baseVal={baseBtc    !== null ? fmtBtc(basePriceKrw!,    baseBtcKrw!)    : (baseBtcKrw    === null ? 'BTC 미존재' : '—')}
        compareVal={compareBtc !== null ? fmtBtc(comparePriceKrw!, compareBtcKrw!) : (compareBtcKrw === null ? 'BTC 미존재' : '—')}
        pct={btcPct}
        baseYear={baseYear} compareYear={compareYear} compareYtd={entry.data!.compareIsYtd}
        unavailable={btcUnavail}
      />
      <AssetRow
        icon="Au" label="금" accent="#EBC15C"
        baseVal={baseGrams    !== null ? fmtGold(basePriceKrw!,    baseGoldKrwPerGram!)    : '—'}
        compareVal={compareGrams !== null ? fmtGold(comparePriceKrw!, compareGoldKrwPerGram!) : '—'}
        pct={goldPct}
        baseYear={baseYear} compareYear={compareYear} compareYtd={entry.data!.compareIsYtd}
      />

      {/* 공유 버튼 */}
      {!noData && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button onClick={handleShareImage} style={shareBtnStyle} disabled={sharing}>
            {sharing
              ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              : <Share2 size={13} />}
            이미지 공유
          </button>
          <button onClick={handleCopyText} style={{
            ...shareBtnStyle,
            ...(copied ? { color: '#2E7A4C', borderColor: '#6FC08A' } : {}),
          }}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? '복사됨' : '텍스트 복사'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────
export default function ApartmentDollarTable({ entries, baseYear, compareYear, onRemove, onAreaChange }: Props) {
  if (entries.length === 0) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '14px' }}>
        단지를 추가해 주세요.
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))',
      gap: '16px',
    }}>
      {entries.map((entry) => {
        /* ── 로딩 ── */
        if (entry.loading) {
          return (
            <div key={entry.id} style={{
              padding: '24px', borderRadius: '18px',
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
                <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{entry.aptName}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{entry.district}</span>
              </div>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{
                  height: '56px', borderRadius: '8px', marginBottom: '8px',
                  backgroundColor: 'var(--border-light)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              ))}
              <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.7} }`}</style>
            </div>
          );
        }

        /* ── 에러 ── */
        if (entry.error || !entry.data) {
          return (
            <div key={entry.id} style={{
              padding: '24px', borderRadius: '18px',
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            }}>
              <div>
                <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{entry.aptName}</p>
                <p style={{ fontSize: '13px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  {entry.error ?? '데이터 없음'} — 선택한 연도에 거래가 없거나 단지명이 다를 수 있어요.
                </p>
              </div>
              <button onClick={() => onRemove(entry.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px', flexShrink: 0 }}>
                <X size={16} />
              </button>
            </div>
          );
        }

        /* ── 데이터 카드 ── */
        return (
          <DollarCard
            key={entry.id}
            entry={entry}
            baseYear={baseYear}
            compareYear={compareYear}
            onRemove={onRemove}
            onAreaChange={onAreaChange}
          />
        );
      })}
    </div>
  );
}
