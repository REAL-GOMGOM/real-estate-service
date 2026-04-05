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

// 상품 선택지 (디딤돌을 일반/생애최초신혼으로 분리)
const PRODUCT_OPTIONS = [
  { id: 'didimdol', label: '디딤돌 (일반)', isNewlywedFirst: false },
  { id: 'didimdol-newlywed', label: '디딤돌 (생애최초 신혼)', isNewlywedFirst: true },
  { id: 'bogeumjari', label: '보금자리론', isNewlywedFirst: false },
  { id: 'baby-loan', label: '신생아 특례', isNewlywedFirst: false },
] as const;

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

function fmtWon(n: number): string {
  if (n >= 10000) {
    const eok = Math.floor(n / 10000);
    const man = n % 10000;
    if (man === 0) return `${eok}억원`;
    return `${eok}억 ${fmt(man)}만원`;
  }
  return `${fmt(n)}만원`;
}

function fmtWonShort(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억`;
  return `${fmt(Math.round(n))}만`;
}

export default function LoanSimulator() {
  const [selectedOption, setSelectedOption] = useState('didimdol');
  const [housePrice, setHousePrice] = useState(50000);
  const [deposit, setDeposit] = useState(15000);
  const [income, setIncome] = useState(5000);
  const [existingDebt, setExistingDebt] = useState(0);
  const [loanTerm, setLoanTerm] = useState(20);
  const [isLocalHouse, setIsLocalHouse] = useState(false);
  const [isCapitalArea, setIsCapitalArea] = useState(true);
  const [exclusiveDiscount, setExclusiveDiscount] = useState<string | null>(null);
  const [stackableDiscounts, setStackableDiscounts] = useState<string[]>([]);
  const [repaymentType, setRepaymentType] = useState<'equal_principal_interest' | 'equal_principal'>('equal_principal_interest');
  const [showSchedule, setShowSchedule] = useState(false);

  // 선택된 옵션 → 실제 productId, isNewlywedFirst 파생
  const optionMeta = PRODUCT_OPTIONS.find((o) => o.id === selectedOption)!;
  const productId = selectedOption === 'didimdol-newlywed' ? 'didimdol' : selectedOption;
  const isNewlywedFirst = optionMeta.isNewlywedFirst;
  const isDidimdol = productId === 'didimdol';

  const product = LOAN_PRODUCTS.find((p) => p.id === productId)!;
  const neededLoan = Math.max(0, housePrice - deposit);

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

  function handleOptionChange(id: string) {
    setSelectedOption(id);
    const realId = id === 'didimdol-newlywed' ? 'didimdol' : id;
    const p = LOAN_PRODUCTS.find((pp) => pp.id === realId)!;
    if (!p.terms.includes(loanTerm)) setLoanTerm(p.terms[p.terms.length - 1]);
    if (realId !== 'didimdol') {
      setExclusiveDiscount(null);
      setStackableDiscounts([]);
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

        {/* ── 기본 정보 섹션 ── */}
        <Section title="기본 정보">
          {/* 매매가 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <FieldLabel>매매가</FieldLabel>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono, monospace)' }}>
                {fmtWon(housePrice)}
              </span>
            </div>
            <input
              type="number"
              value={housePrice}
              onChange={(e) => setHousePrice(Math.max(0, Number(e.target.value) || 0))}
              step={1000}
              style={inputStyle}
            />
            <input
              type="range"
              min={10000}
              max={300000}
              step={1000}
              value={housePrice}
              onChange={(e) => setHousePrice(Number(e.target.value))}
              style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>1억</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>30억</span>
            </div>
          </div>

          {/* 자기자금 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <FieldLabel>자기자금 (만원)</FieldLabel>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                필요 대출금: <strong style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtWon(neededLoan)}</strong>
              </span>
            </div>
            <input
              type="number"
              value={deposit}
              onChange={(e) => {
                const v = Math.max(0, Math.min(housePrice, Number(e.target.value) || 0));
                setDeposit(v);
              }}
              step={1000}
              style={inputStyle}
            />
          </div>

          {/* 연소득 + 기존대출 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <FieldLabel style={{ marginBottom: 6 }}>부부합산 연소득 (만원)</FieldLabel>
              <input
                type="number"
                value={income}
                onChange={(e) => setIncome(Math.max(0, Number(e.target.value) || 0))}
                step={100}
                style={inputStyle}
              />
            </div>
            <div>
              <FieldLabel style={{ marginBottom: 6 }}>기존 대출 연상환액 (만원)</FieldLabel>
              <input
                type="number"
                value={existingDebt}
                onChange={(e) => setExistingDebt(Math.max(0, Number(e.target.value) || 0))}
                step={100}
                style={inputStyle}
              />
            </div>
          </div>
        </Section>

        {/* ── 상품 선택 섹션 ── */}
        <Section title="상품 선택">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PRODUCT_OPTIONS.map((opt) => {
              const selected = selectedOption === opt.id;
              return (
                <label
                  key={opt.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
                    backgroundColor: selected ? 'var(--accent-bg)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="product"
                    checked={selected}
                    onChange={() => handleOptionChange(opt.id)}
                    style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span style={{
                    fontSize: 14,
                    fontWeight: selected ? 600 : 400,
                    color: selected ? 'var(--accent)' : 'var(--text-primary)',
                  }}>
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>

          {/* 자격요건 */}
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 10,
            backgroundColor: 'var(--border-light)',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
              {product.eligibility.map((e, i) => (
                <span key={i} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: 'var(--accent)', flexShrink: 0 }} />
                  {e}
                </span>
              ))}
            </div>
          </div>
        </Section>

        {/* ── 대출 조건 섹션 ── */}
        <Section title="대출 조건">
          {/* 대출기간 */}
          <div style={{ marginBottom: 18 }}>
            <FieldLabel style={{ marginBottom: 8 }}>대출기간</FieldLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {product.terms.map((t) => (
                <button
                  key={t}
                  onClick={() => setLoanTerm(t)}
                  style={pillStyle(loanTerm === t)}
                >
                  {t}년
                </button>
              ))}
            </div>
          </div>

          {/* 상환방식 */}
          <div>
            <FieldLabel style={{ marginBottom: 8 }}>상환방식</FieldLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['equal_principal_interest', '원리금균등'], ['equal_principal', '원금균등']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setRepaymentType(val)}
                  style={pillStyle(repaymentType === val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* ── 우대금리 섹션 (디딤돌만) ── */}
        {isDidimdol && (
          <Section title="우대금리">
            {/* 택1 */}
            <div style={{ marginBottom: 18 }}>
              <FieldLabel style={{ marginBottom: 8 }}>택1 우대 (하나만 선택)</FieldLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* 없음 옵션 */}
                <label style={radioRowStyle(exclusiveDiscount === null)}>
                  <input
                    type="radio"
                    name="exclusive"
                    checked={exclusiveDiscount === null}
                    onChange={() => setExclusiveDiscount(null)}
                    style={radioStyle}
                  />
                  <span style={{ fontSize: 13, color: exclusiveDiscount === null ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    없음
                  </span>
                </label>
                {EXCLUSIVE_DISCOUNTS.map((d) => {
                  const selected = exclusiveDiscount === d.id;
                  return (
                    <label key={d.id} style={radioRowStyle(selected)}>
                      <input
                        type="radio"
                        name="exclusive"
                        checked={selected}
                        onChange={() => setExclusiveDiscount(d.id)}
                        style={radioStyle}
                      />
                      <span style={{ fontSize: 13, color: selected ? 'var(--accent)' : 'var(--text-secondary)', flex: 1 }}>
                        {d.label}
                      </span>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: selected ? 'var(--accent)' : 'var(--text-dim)',
                        fontFamily: 'var(--font-mono, monospace)',
                      }}>
                        -{d.rate}%p
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 중복 가능 */}
            <div>
              <FieldLabel style={{ marginBottom: 8 }}>중복 가능 우대 (복수 선택)</FieldLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {STACKABLE_DISCOUNTS.map((d) => {
                  const checked = stackableDiscounts.includes(d.id);
                  return (
                    <label key={d.id} style={checkRowStyle(checked)}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStackable(d.id)}
                        style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 13, color: checked ? 'var(--accent)' : 'var(--text-secondary)', flex: 1 }}>
                        {d.label}
                        {d.note && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>({d.note})</span>}
                      </span>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: checked ? 'var(--accent)' : 'var(--text-dim)',
                        fontFamily: 'var(--font-mono, monospace)',
                      }}>
                        -{d.rate}%p
                      </span>
                    </label>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, marginBottom: 0 }}>
                * 청약저축 (5년/10년/15년)은 1개만 선택 가능
              </p>
            </div>
          </Section>
        )}

        {/* ── 지역 섹션 ── */}
        <Section title="지역">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ToggleRow
              label="지방 소재 주택"
              sub={isDidimdol ? '(-0.2%p 우대)' : undefined}
              checked={isLocalHouse}
              onChange={setIsLocalHouse}
            />
            <ToggleRow
              label="수도권 여부"
              sub={isDidimdol && isNewlywedFirst ? '(생애최초 LTV 70% 제한)' : undefined}
              checked={isCapitalArea}
              onChange={setIsCapitalArea}
            />
          </div>
        </Section>

        {/* ── 결과 패널 ── */}
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

          {/* 핵심 숫자 3카드 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            marginBottom: 16,
          }}>
            <ResultCard
              label="대출금액"
              value={fmtWonShort(result.loanAmount)}
              sub={`LTV ${result.ltvUsed}%`}
            />
            <ResultCard
              label="적용금리"
              value={`${result.appliedRate}%`}
              sub={isDidimdol ? `${result.baseRate}% - ${result.discountRate}%p` : '고정금리'}
            />
            <ResultCard
              label="월 상환액"
              value={`${fmt(Math.round(result.monthlyPayment))}만`}
              highlight
            />
          </div>

          {/* 부가 정보 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginBottom: 16,
          }}>
            <MiniStat label="총 이자" value={fmtWonShort(result.totalInterest)} />
            <MiniStat label="총 상환" value={fmtWonShort(result.totalPayment)} />
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

        {/* ── 상환 스케줄 ── */}
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
                        <td style={tdStyle}>{s.month}</td>
                        <td style={tdMonoStyle}>{fmt(Math.round(s.principal))}</td>
                        <td style={{ ...tdMonoStyle, color: 'var(--text-secondary)' }}>{fmt(Math.round(s.interest))}</td>
                        <td style={{ ...tdMonoStyle, color: 'var(--text-strong)', fontWeight: 600 }}>{fmt(Math.round(s.payment))}</td>
                        <td style={{ ...tdMonoStyle, color: 'var(--text-muted)' }}>{fmt(Math.round(s.remainingBalance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.6 }}>
          본 시뮬레이션은 참고용이며 실제 대출 심사 결과와 다를 수 있습니다.
          <br />
          금리 기준일: {LAST_UPDATED} | 한국주택금융공사 공시
        </p>
      </div>
    </main>
  );
}

/* ── Shared styles ── */

const inputStyle: React.CSSProperties = {
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
};

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: active ? 'var(--accent)' : 'var(--border-light)',
    color: active ? 'white' : 'var(--text-muted)',
    transition: 'background 0.15s',
  };
}

function radioRowStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 10,
    border: selected ? '1.5px solid var(--accent)' : '1px solid var(--border)',
    backgroundColor: selected ? 'var(--accent-bg)' : 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };
}

function checkRowStyle(checked: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 10,
    border: checked ? '1.5px solid var(--accent)' : '1px solid var(--border)',
    backgroundColor: checked ? 'var(--accent-bg)' : 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };
}

const radioStyle: React.CSSProperties = {
  accentColor: 'var(--accent)',
  width: 16,
  height: 16,
  cursor: 'pointer',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'right',
  color: 'var(--text-muted)',
};

const tdMonoStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'right',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono, monospace)',
};

/* ── Sub-components ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 20,
      borderRadius: 14,
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border)',
      marginBottom: 24,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 18px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function FieldLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{
      fontSize: 12,
      fontWeight: 500,
      color: 'var(--text-muted)',
      display: 'block',
      ...style,
    }}>
      {children}
    </label>
  );
}

function ToggleRow({ label, sub, checked, onChange }: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      borderRadius: 10,
      border: '1px solid var(--border)',
      cursor: 'pointer',
      backgroundColor: checked ? 'var(--accent-bg)' : 'transparent',
      transition: 'all 0.15s',
    }}>
      <span>
        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
        {sub && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>{sub}</span>}
      </span>
      <div
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          backgroundColor: checked ? 'var(--accent)' : 'var(--border)',
          position: 'relative',
          transition: 'background 0.2s',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: 'white',
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </label>
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
      padding: '14px 12px',
      borderRadius: 12,
      backgroundColor: highlight ? 'var(--accent-bg)' : 'var(--border-light)',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 6px' }}>{label}</p>
      <p style={{
        fontSize: 18,
        fontWeight: 700,
        color: highlight ? 'var(--accent)' : 'var(--text-strong)',
        margin: 0,
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: 10,
      backgroundColor: 'var(--border-light)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>{value}</span>
    </div>
  );
}
