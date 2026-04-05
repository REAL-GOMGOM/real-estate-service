'use client';

import { useState, useEffect } from 'react';
import { TrendingDown, RefreshCw, Building2, AlertTriangle } from 'lucide-react';

const MONO = "'Roboto Mono', var(--font-mono, monospace)";

interface RateRange {
  min: number;
  max: number;
  avg: number;
}

interface BankProduct {
  productName: string;
  joinWay: string;
  earlyRepayFee: string;
  fixed?: RateRange;
  variable?: RateRange;
  mixed?: RateRange;
}

interface BankGroup {
  bankName: string;
  products: BankProduct[];
}

interface Summary {
  fixedAvg: number;
  variableAvg: number;
  lowestFixed: { bank: string; rate: number } | null;
  lowestVariable: { bank: string; rate: number } | null;
}

interface BankRateData {
  updatedAt?: string;
  banks: BankGroup[];
  summary?: Summary;
  message?: string;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

export default function BankRateComparison() {
  const [data, setData] = useState<BankRateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateFilter, setRateFilter] = useState<'all' | 'fixed' | 'variable'>('all');

  async function fetchRates() {
    setLoading(true);
    try {
      const res = await fetch('/api/loan/bank-rates');
      const json: BankRateData = await res.json();
      setData(json);
    } catch {
      setData({ banks: [], message: '데이터를 불러올 수 없습니다.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRates(); }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <RefreshCw size={24} style={{ color: 'var(--text-dim)', animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>금감원 API 조회 중...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // API 점검 중 또는 에러
  if (!data || data.banks.length === 0) {
    return (
      <div style={{
        padding: 32, borderRadius: 16, textAlign: 'center',
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
      }}>
        <AlertTriangle size={36} style={{ color: 'var(--warning, #c89632)', marginBottom: 12 }} />
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 8px' }}>
          데이터를 불러올 수 없습니다
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
          {data?.message ?? '금감원 API 점검 중입니다. 평일에 다시 확인해주세요.'}
        </p>
        <button
          onClick={fetchRates}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
            backgroundColor: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} />
          다시 시도
        </button>
      </div>
    );
  }

  const { banks, summary, updatedAt } = data;

  return (
    <div>
      {/* 요약 카드 */}
      {summary && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20,
        }}>
          <SummaryCard
            label="고정금리 평균"
            value={summary.fixedAvg > 0 ? `${fmt(summary.fixedAvg)}%` : '-'}
            sub={summary.lowestFixed ? `최저 ${fmt(summary.lowestFixed.rate)}% (${summary.lowestFixed.bank})` : undefined}
          />
          <SummaryCard
            label="변동금리 평균"
            value={summary.variableAvg > 0 ? `${fmt(summary.variableAvg)}%` : '-'}
            sub={summary.lowestVariable ? `최저 ${fmt(summary.lowestVariable.rate)}% (${summary.lowestVariable.bank})` : undefined}
            highlight
          />
        </div>
      )}

      {/* 필터 + 기준일 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 10, backgroundColor: 'var(--border-light)' }}>
          {([['all', '전체'], ['fixed', '고정'], ['variable', '변동']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setRateFilter(v)}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                border: 'none', cursor: 'pointer',
                backgroundColor: rateFilter === v ? 'var(--accent)' : 'transparent',
                color: rateFilter === v ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {l}
            </button>
          ))}
        </div>
        {updatedAt && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            기준일: {updatedAt}
          </span>
        )}
      </div>

      {/* 은행별 카드 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {banks.map((bank) => (
          <BankCard key={bank.bankName} bank={bank} rateFilter={rateFilter} />
        ))}
      </div>

      {/* 안내 */}
      <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
        ※ 금감원 금융상품통합비교공시 기준 (아파트 담보, 분할상환)
        <br />
        실제 금리는 개인 신용등급, 대출기간, LTV 등에 따라 달라집니다.
      </p>
    </div>
  );
}

/* ── Sub-components ── */

function BankCard({ bank, rateFilter }: { bank: BankGroup; rateFilter: 'all' | 'fixed' | 'variable' }) {
  return (
    <div style={{
      padding: 16, borderRadius: 14,
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
    }}>
      {/* 은행명 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Building2 size={16} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
          {bank.bankName}
        </span>
      </div>

      {/* 상품 목록 */}
      {bank.products.map((product, i) => {
        const showFixed = (rateFilter === 'all' || rateFilter === 'fixed') && product.fixed;
        const showVariable = (rateFilter === 'all' || rateFilter === 'variable') && product.variable;
        const showMixed = rateFilter === 'all' && product.mixed;

        if (!showFixed && !showVariable && !showMixed) return null;

        return (
          <div key={i} style={{
            padding: '10px 0',
            borderTop: i > 0 ? '1px solid var(--border)' : 'none',
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
              {product.productName}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {showFixed && <RateChip label="고정" range={product.fixed!} />}
              {showVariable && <RateChip label="변동" range={product.variable!} />}
              {showMixed && <RateChip label="혼합" range={product.mixed!} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RateChip({ label, range }: { label: string; range: RateRange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', borderRadius: 8,
      backgroundColor: 'var(--border-light)',
    }}>
      <span style={{
        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
        backgroundColor: label === '변동' ? 'var(--accent-bg)' : label === '고정' ? 'var(--bg-overlay)' : 'var(--warning-bg, rgba(200,150,50,0.1))',
        color: label === '변동' ? 'var(--accent)' : 'var(--text-secondary)',
      }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontFamily: MONO, fontWeight: 700, color: 'var(--text-strong)' }}>
        {fmt(range.min)}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>~</span>
      <span style={{ fontSize: 13, fontFamily: MONO, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {fmt(range.max)}%
      </span>
      <TrendingDown size={11} style={{ color: 'var(--success)', marginLeft: 2 }} />
    </div>
  );
}

function SummaryCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{
      padding: '16px 14px', borderRadius: 12, textAlign: 'center',
      backgroundColor: highlight ? 'var(--accent-bg)' : 'var(--border-light)',
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 6px' }}>{label}</p>
      <p style={{
        fontSize: 22, fontWeight: 800, margin: 0,
        color: highlight ? 'var(--accent)' : 'var(--text-strong)',
        fontFamily: MONO, lineHeight: 1.2,
      }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: '6px 0 0' }}>{sub}</p>}
    </div>
  );
}
