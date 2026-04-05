'use client';

import { useState, useMemo } from 'react';
import { simulateLoan, LoanInput, LoanResult } from '@/lib/loan-calculator';
import {
  LOAN_PRODUCTS,
  EXCLUSIVE_DISCOUNTS,
  STACKABLE_DISCOUNTS,
  LAST_UPDATED,
} from '@/lib/loan-products';
import { Calculator, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const SAVINGS_IDS = ['savings_5y', 'savings_10y', 'savings_15y'];

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

function fmtWon(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억`;
  return `${fmt(Math.round(n))}만`;
}

export default function LoanSimulator() {
  const [productId, setProductId] = useState('didimdol');
  const [housePrice, setHousePrice] = useState(50000);
  const [deposit, setDeposit] = useState(15000);
  const [income, setIncome] = useState(5000);
  const [existingDebt, setExistingDebt] = useState(0);
  const [loanTerm, setLoanTerm] = useState(20);
  const [isNewlywedFirst, setIsNewlywedFirst] = useState(false);
  const [isLocalHouse, setIsLocalHouse] = useState(false);
  const [isCapitalArea, setIsCapitalArea] = useState(true);
  const [exclusiveDiscount, setExclusiveDiscount] = useState<string | null>(null);
  const [stackableDiscounts, setStackableDiscounts] = useState<string[]>([]);
  const [repaymentType, setRepaymentType] = useState<'equal_principal_interest' | 'equal_principal'>('equal_principal_interest');
  const [showSchedule, setShowSchedule] = useState(false);

  const product = LOAN_PRODUCTS.find((p) => p.id === productId)!;

  const result: LoanResult = useMemo(() => {
    const input: LoanInput = {
      housePrice,
      deposit,
      income,
      existingDebtPayment: existingDebt,
      loanTerm,
      productId,
      isNewlywedFirstTime: isNewlywedFirst,
      isLocalHouse,
      isCapitalArea,
      exclusiveDiscount,
      stackableDiscounts,
      repaymentType,
    };
    return simulateLoan(input);
  }, [housePrice, deposit, income, existingDebt, loanTerm, productId, isNewlywedFirst, isLocalHouse, isCapitalArea, exclusiveDiscount, stackableDiscounts, repaymentType]);

  const isDidimdol = productId === 'didimdol';

  function handleProductChange(id: string) {
    setProductId(id);
    const p = LOAN_PRODUCTS.find((pp) => pp.id === id)!;
    if (!p.terms.includes(loanTerm)) setLoanTerm(p.terms[p.terms.length - 1]);
    if (id !== 'didimdol') {
      setExclusiveDiscount(null);
      setStackableDiscounts([]);
      setIsNewlywedFirst(false);
    }
  }

  function toggleStackable(id: string) {
    setStackableDiscounts((prev) => {
      if (SAVINGS_IDS.includes(id)) {
        const without = prev.filter((d) => !SAVINGS_IDS.includes(d));
        return prev.includes(id) ? without : [...without, id];
      }
      return prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id];
    });
  }

  return (
    <main style={{ paddingTop: 80, paddingBottom: 48, minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px' }}>
        {/* Title */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Calculator size={22} style={{ color: 'var(--accent)' }} />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>
              대출 시뮬레이터
            </h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            한국주택금융공사 공시 금리 기준 ({LAST_UPDATED})
          </p>
        </div>

        {/* Product Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {LOAN_PRODUCTS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleProductChange(p.id)}
              style={{
                padding: '10px 18px',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                border: productId === p.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                backgroundColor: productId === p.id ? 'var(--accent-bg)' : 'var(--bg-card)',
                color: productId === p.id ? 'var(--accent)' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Product Info */}
        <div style={{
          padding: '14px 18px',
          borderRadius: 12,
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          marginBottom: 24,
        }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
            {product.description}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            {product.eligibility.map((e, i) => (
              <span key={i} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'var(--accent)', flexShrink: 0 }} />
                {e}
              </span>
            ))}
          </div>
        </div>

        {/* Input Section */}
        <div style={{
          padding: 20,
          borderRadius: 14,
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          marginBottom: 24,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 18px' }}>
            기본 정보
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <NumberField label="매매가 (만원)" value={housePrice} onChange={setHousePrice} step={1000} />
            <NumberField label="자기자금 (만원)" value={deposit} onChange={setDeposit} step={1000} />
            <NumberField label="부부합산 연소득 (만원)" value={income} onChange={setIncome} step={100} />
            <NumberField label="기존 대출 연상환액 (만원)" value={existingDebt} onChange={setExistingDebt} step={100} />
          </div>

          {/* Term */}
          <div style={{ marginTop: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              대출기간
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {product.terms.map((t) => (
                <button
                  key={t}
                  onClick={() => setLoanTerm(t)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: loanTerm === t ? 'var(--accent)' : 'var(--border-light)',
                    color: loanTerm === t ? 'white' : 'var(--text-muted)',
                    transition: 'background 0.15s',
                  }}
                >
                  {t}년
                </button>
              ))}
            </div>
          </div>

          {/* Repayment Type */}
          <div style={{ marginTop: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              상환방식
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['equal_principal_interest', '원리금균등'], ['equal_principal', '원금균등']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setRepaymentType(val)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: repaymentType === val ? 'var(--accent)' : 'var(--border-light)',
                    color: repaymentType === val ? 'white' : 'var(--text-muted)',
                    transition: 'background 0.15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: '10px 20px' }}>
            <ToggleChip label="수도권" checked={isCapitalArea} onChange={setIsCapitalArea} />
            <ToggleChip label="지방 소재" checked={isLocalHouse} onChange={setIsLocalHouse} />
            {isDidimdol && (
              <ToggleChip label="생애최초/신혼" checked={isNewlywedFirst} onChange={setIsNewlywedFirst} />
            )}
          </div>
        </div>

        {/* Discount Section (didimdol only) */}
        {isDidimdol && (
          <div style={{
            padding: 20,
            borderRadius: 14,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            marginBottom: 24,
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 16px' }}>
              우대금리
            </h2>

            {/* Exclusive */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                택1 우대 (하나만 선택)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {EXCLUSIVE_DISCOUNTS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setExclusiveDiscount(exclusiveDiscount === d.id ? null : d.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      border: exclusiveDiscount === d.id ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                      backgroundColor: exclusiveDiscount === d.id ? 'var(--accent-bg)' : 'transparent',
                      color: exclusiveDiscount === d.id ? 'var(--accent)' : 'var(--text-secondary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {d.label} (-{d.rate}%p)
                  </button>
                ))}
              </div>
            </div>

            {/* Stackable */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                중복 우대 (복수 선택)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STACKABLE_DISCOUNTS.map((d) => {
                  const selected = stackableDiscounts.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggleStackable(d.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        border: selected ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                        backgroundColor: selected ? 'var(--accent-bg)' : 'transparent',
                        color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {d.label} (-{d.rate}%p)
                      {d.note && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>({d.note})</span>}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                * 청약저축(5/10/15년)은 1개만 선택 가능
              </p>
            </div>
          </div>
        )}

        {/* Result Section */}
        <div style={{
          padding: 20,
          borderRadius: 14,
          border: result.feasible
            ? '2px solid var(--success-border, var(--success))'
            : '2px solid var(--danger-border, var(--danger))',
          backgroundColor: 'var(--bg-card)',
          marginBottom: 24,
        }}>
          {/* Feasibility Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            {result.feasible ? (
              <CheckCircle size={18} style={{ color: 'var(--success)' }} />
            ) : (
              <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
            )}
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: result.feasible ? 'var(--success)' : 'var(--danger)',
            }}>
              {result.feasible ? '대출 가능' : '대출 요건 미충족'}
            </span>
          </div>

          {/* Reject Reasons */}
          {result.rejectReasons.length > 0 && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: 'var(--danger-bg, rgba(185, 62, 50, 0.08))',
              marginBottom: 16,
            }}>
              {result.rejectReasons.map((r, i) => (
                <p key={i} style={{ fontSize: 12, color: 'var(--danger)', margin: i > 0 ? '4px 0 0' : 0 }}>
                  {r}
                </p>
              ))}
            </div>
          )}

          {/* Key Numbers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}>
            <ResultCard label="대출금액" value={fmtWon(result.loanAmount)} sub={`LTV ${result.ltvUsed}%`} />
            <ResultCard label="적용금리" value={`${result.appliedRate}%`} sub={isDidimdol ? `기본 ${result.baseRate}% - 우대 ${result.discountRate}%` : `고정금리`} />
            <ResultCard label="월 상환액" value={`${fmt(Math.round(result.monthlyPayment))}만` } highlight />
            <ResultCard label="총 이자" value={fmtWon(result.totalInterest)} sub={`총 상환 ${fmtWon(result.totalPayment)}`} />
          </div>

          {/* DSR */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            backgroundColor: result.dsr > 40 ? 'var(--danger-bg, rgba(185, 62, 50, 0.08))' : 'var(--border-light)',
          }}>
            <Info size={14} style={{ color: result.dsr > 40 ? 'var(--danger)' : 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: result.dsr > 40 ? 'var(--danger)' : 'var(--text-secondary)' }}>
              DSR {result.dsr}%
              {result.dsr > 40 ? ' (40% 초과 — 심사 제한 가능)' : ' (40% 이내)'}
            </span>
          </div>
        </div>

        {/* Schedule */}
        {result.schedule.length > 0 && (
          <div style={{
            borderRadius: 14,
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            marginBottom: 24,
          }}>
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              style={{
                width: '100%',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-strong)',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              상환 스케줄 (첫 12개월)
              {showSchedule ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showSchedule && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--border-light)' }}>
                      {['회차', '원금', '이자', '상환액', '잔액'].map((h) => (
                        <th key={h} style={{
                          padding: '8px 12px',
                          textAlign: 'right',
                          color: 'var(--text-muted)',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.schedule.map((s) => (
                      <tr key={s.month} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{s.month}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>{fmt(Math.round(s.principal))}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono, monospace)' }}>{fmt(Math.round(s.interest))}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-strong)', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>{fmt(Math.round(s.payment))}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>{fmt(Math.round(s.remainingBalance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Footer note */}
        <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6 }}>
          본 시뮬레이션은 참고용이며 실제 대출 심사 결과와 다를 수 있습니다.
          <br />
          금리 기준일: {LAST_UPDATED} | 한국주택금융공사 공시
        </p>
      </div>
    </main>
  );
}

/* ── Sub-components ── */

function NumberField({ label, value, onChange, step = 100 }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        step={step}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          fontSize: 14,
          fontFamily: 'var(--font-mono, monospace)',
          backgroundColor: 'var(--border-light)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function ToggleChip({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        padding: '6px 14px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        border: checked ? '1.5px solid var(--accent)' : '1px solid var(--border)',
        backgroundColor: checked ? 'var(--accent-bg)' : 'transparent',
        color: checked ? 'var(--accent)' : 'var(--text-muted)',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function ResultCard({ label, value, sub, highlight }: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 12,
      backgroundColor: highlight ? 'var(--accent-bg)' : 'var(--border-light)',
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 4px' }}>{label}</p>
      <p style={{
        fontSize: 18,
        fontWeight: 700,
        color: highlight ? 'var(--accent)' : 'var(--text-strong)',
        margin: 0,
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}
