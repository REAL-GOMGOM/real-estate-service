'use client';

import { X, Loader2 } from 'lucide-react';
import type { ApartmentEntry } from '@/components/dollar/DollarPageClient';

interface Props {
  entries:    ApartmentEntry[];
  baseYear:   number;
  compareYear: number;
  onRemove:   (id: string) => void;
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

// ── 변동률 뱃지 ────────────────────────────────────
function ChangeBadge({ pct }: { pct: number }) {
  const up    = pct >= 0;
  const color = up ? '#4ADE80' : '#F87171';
  const bg    = up ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '2px',
      padding: '3px 10px', borderRadius: '999px', fontSize: '13px', fontWeight: 700,
      fontFamily: 'Roboto Mono, monospace', color, backgroundColor: bg,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
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
  unavailable?: boolean;
}

function AssetRow({ icon, label, accent, baseVal, compareVal, pct, baseYear, compareYear, unavailable }: RowProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '14px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
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
        <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 500 }}>{label}</span>
      </div>

      {/* 기준년 값 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '10px', color: '#64748B', marginBottom: '2px' }}>{baseYear}년</p>
        <p style={{
          fontSize: '15px', fontWeight: 700,
          fontFamily: 'Roboto Mono, monospace', color: '#CBD5E1',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {baseVal}
        </p>
      </div>

      {/* 화살표 */}
      <span style={{ color: '#334155', fontSize: '16px', flexShrink: 0 }}>→</span>

      {/* 비교년 값 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '10px', color: '#64748B', marginBottom: '2px' }}>{compareYear}년</p>
        <p style={{
          fontSize: '15px', fontWeight: 700,
          fontFamily: 'Roboto Mono, monospace', color: accent,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {compareVal}
        </p>
      </div>

      {/* 변동률 */}
      <div style={{ flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>
        {unavailable
          ? <span style={{ fontSize: '10px', color: '#475569', fontStyle: 'italic' }}>해당 없음</span>
          : pct !== null ? <ChangeBadge pct={pct} /> : <span style={{ color: '#475569', fontSize: '12px' }}>—</span>
        }
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────
export default function ApartmentDollarTable({ entries, baseYear, compareYear, onRemove }: Props) {
  if (entries.length === 0) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>
        단지를 추가해 주세요.
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))',
      gap: '16px',
    }}>
      {entries.map((entry) => {
        /* ── 로딩 ── */
        if (entry.loading) {
          return (
            <div key={entry.id} style={{
              padding: '24px', borderRadius: '18px',
              backgroundColor: '#0F1629', border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: '#3B82F6' }} />
                <span style={{ fontWeight: 700, color: '#CBD5E1' }}>{entry.aptName}</span>
                <span style={{ fontSize: '12px', color: '#64748B' }}>{entry.district}</span>
              </div>
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{
                  height: '56px', borderRadius: '8px', marginBottom: '8px',
                  backgroundColor: 'rgba(255,255,255,0.03)',
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
              backgroundColor: '#0F1629', border: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ fontWeight: 700, color: '#F1F5F9', marginBottom: '4px' }}>{entry.aptName}</p>
                <p style={{ fontSize: '13px', color: '#475569' }}>{entry.error ?? '데이터 없음'}</p>
              </div>
              <button onClick={() => onRemove(entry.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '4px' }}>
                <X size={16} />
              </button>
            </div>
          );
        }

        /* ── 데이터 ── */
        const {
          basePriceKrw, comparePriceKrw,
          baseExchangeRate, compareExchangeRate,
          baseBtcKrw, compareBtcKrw,
          baseGoldKrwPerGram, compareGoldKrwPerGram,
        } = entry.data;

        const hasBase    = basePriceKrw    !== null;
        const hasCompare = comparePriceKrw !== null;

        // KRW
        const krwPct = hasBase && hasCompare
          ? ((comparePriceKrw! - basePriceKrw!) / basePriceKrw!) * 100 : null;

        // USD
        const baseUsd    = hasBase    ? (basePriceKrw!    * 10000) / baseExchangeRate    : null;
        const compareUsd = hasCompare ? (comparePriceKrw! * 10000) / compareExchangeRate : null;
        const usdPct     = baseUsd && compareUsd ? ((compareUsd - baseUsd) / baseUsd) * 100 : null;

        // BTC — Bitcoin 미존재 연도(null)이면 계산 불가
        const baseBtc    = (hasBase    && baseBtcKrw    !== null) ? (basePriceKrw!    * 10000) / baseBtcKrw    : null;
        const compareBtc = (hasCompare && compareBtcKrw !== null) ? (comparePriceKrw! * 10000) / compareBtcKrw : null;
        const btcPct     = baseBtc !== null && compareBtc !== null ? ((compareBtc - baseBtc) / baseBtc) * 100 : null;
        const btcUnavail = baseBtcKrw === null || compareBtcKrw === null;

        // 금
        const baseGrams    = (hasBase    && baseGoldKrwPerGram    !== null) ? (basePriceKrw!    * 10000) / baseGoldKrwPerGram    : null;
        const compareGrams = (hasCompare && compareGoldKrwPerGram !== null) ? (comparePriceKrw! * 10000) / compareGoldKrwPerGram : null;
        const goldPct      = baseGrams !== null && compareGrams !== null ? ((compareGrams - baseGrams) / baseGrams) * 100 : null;

        const dollarGain = usdPct  !== null && usdPct  > 0;
        const dollarLoss = usdPct  !== null && usdPct  < 0;
        const btcGain    = btcPct  !== null && btcPct  > 0;
        const btcLoss    = btcPct  !== null && btcPct  < 0;
        const goldGain   = goldPct !== null && goldPct > 0;
        const goldLoss   = goldPct !== null && goldPct < 0;

        return (
          <div key={entry.id} style={{
            padding: '22px 24px', borderRadius: '18px',
            backgroundColor: '#0F1629',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {/* 카드 헤더 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#FFFFFF' }}>{entry.aptName}</span>
                <span style={{ fontSize: '12px', color: '#64748B', marginLeft: '8px' }}>{entry.district}</span>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {dollarGain && (
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
                      달러 환산 이익
                    </span>
                  )}
                  {dollarLoss && (
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(248,113,113,0.12)', color: '#F87171' }}>
                      달러 환산 손실
                    </span>
                  )}
                  {btcGain && (
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(45,212,191,0.12)', color: '#2DD4BF' }}>
                      BTC 환산 이익
                    </span>
                  )}
                  {btcLoss && (
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(249,115,22,0.12)', color: '#FB923C' }}>
                      BTC 환산 손실
                    </span>
                  )}
                  {goldGain && (
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(163,230,53,0.12)', color: '#A3E635' }}>
                      금 환산 이익
                    </span>
                  )}
                  {goldLoss && (
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(251,191,36,0.12)', color: '#FBBF24' }}>
                      금 환산 손실
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => onRemove(entry.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334155', padding: '4px', flexShrink: 0 }}>
                <X size={15} />
              </button>
            </div>

            {/* 자산별 비교 행 */}
            <AssetRow
              icon="₩" label="원화" accent="#E2E8F0"
              baseVal={hasBase    ? fmtKrw(basePriceKrw!)    : '—'}
              compareVal={hasCompare ? fmtKrw(comparePriceKrw!) : '—'}
              pct={krwPct}
              baseYear={baseYear} compareYear={compareYear}
            />
            <AssetRow
              icon="$" label="달러" accent="#FCD34D"
              baseVal={baseUsd    ? fmtUsd(basePriceKrw!,    baseExchangeRate)    : '—'}
              compareVal={compareUsd ? fmtUsd(comparePriceKrw!, compareExchangeRate) : '—'}
              pct={usdPct}
              baseYear={baseYear} compareYear={compareYear}
            />
            <AssetRow
              icon="₿" label="비트" accent="#FB923C"
              baseVal={baseBtc    !== null ? fmtBtc(basePriceKrw!,    baseBtcKrw!)    : (baseBtcKrw    === null ? 'BTC 미존재' : '—')}
              compareVal={compareBtc !== null ? fmtBtc(comparePriceKrw!, compareBtcKrw!) : (compareBtcKrw === null ? 'BTC 미존재' : '—')}
              pct={btcPct}
              baseYear={baseYear} compareYear={compareYear}
              unavailable={btcUnavail}
            />
            <AssetRow
              icon="Au" label="금" accent="#FBBF24"
              baseVal={baseGrams    !== null ? fmtGold(basePriceKrw!,    baseGoldKrwPerGram!)    : '—'}
              compareVal={compareGrams !== null ? fmtGold(comparePriceKrw!, compareGoldKrwPerGram!) : '—'}
              pct={goldPct}
              baseYear={baseYear} compareYear={compareYear}
            />
          </div>
        );
      })}
    </div>
  );
}
