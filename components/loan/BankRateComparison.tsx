'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw, Building2, AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  simulateBankLoan,
  BankLoanInput,
  BankLoanResult,
  LTV_BY_REGULATION,
  REGULATION_LABELS,
  STRESS_RATE,
} from '@/lib/bank-loan-calculator';
import { simulateLoan, LoanInput } from '@/lib/loan-calculator';

const MONO = "'Roboto Mono', var(--font-mono, monospace)";

/* ── Types ── */

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

type RateType = 'fixed' | 'variable';
type Regulation = 'speculative' | 'adjusted' | 'none';
type RepaymentType = 'equal_principal_interest' | 'equal_principal';

/* ── Helpers ── */

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

function fmtWon(n: number): string {
  if (n >= 10000) {
    const eok = Math.floor(n / 10000);
    const man = Math.round(n % 10000);
    if (man === 0) return `${eok}억원`;
    return `${eok}억 ${fmt(man)}만원`;
  }
  return `${fmt(Math.round(n))}만원`;
}

function fmtWonShort(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억`;
  return `${fmt(Math.round(n))}만`;
}

/* ── Main Component ── */

export default function BankRateComparison({ onSwitchToPolicy }: { onSwitchToPolicy?: () => void }) {
  const [data, setData] = useState<BankRateData | null>(null);
  const [loading, setLoading] = useState(true);

  // Inputs
  const [housePrice, setHousePrice] = useState(50000);
  const [deposit, setDeposit] = useState(20000);
  const [income, setIncome] = useState(5000);
  const [existingDebt, setExistingDebt] = useState(0);
  const [rateType, setRateType] = useState<RateType>('fixed');
  const [repaymentType, setRepaymentType] = useState<RepaymentType>('equal_principal_interest');
  const [loanTerm, setLoanTerm] = useState(30);
  const [regulation, setRegulation] = useState<Regulation>('none');
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  // UI state
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);

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

  const banks = data?.banks ?? [];

  // 선택된 은행/상품의 금리 범위 조회
  const selectedRateRange = useMemo(() => {
    if (!selectedBank || !selectedProduct) return null;
    const bank = banks.find((b) => b.bankName === selectedBank);
    if (!bank) return null;
    const product = bank.products.find((p) => p.productName === selectedProduct);
    if (!product) return null;
    const range = rateType === 'fixed' ? product.fixed : product.variable;
    return range ?? null;
  }, [selectedBank, selectedProduct, rateType, banks]);

  // 시뮬레이션 결과
  const result: BankLoanResult | null = useMemo(() => {
    if (!selectedRateRange || !selectedBank || !selectedProduct) return null;
    const input: BankLoanInput = {
      housePrice,
      deposit,
      income,
      existingDebtPayment: existingDebt,
      loanTerm,
      rateType,
      rateMin: selectedRateRange.min,
      rateMax: selectedRateRange.max,
      regulation,
      repaymentType,
      bankName: selectedBank,
      productName: selectedProduct,
    };
    return simulateBankLoan(input);
  }, [selectedRateRange, selectedBank, selectedProduct, housePrice, deposit, income, existingDebt, loanTerm, rateType, repaymentType, regulation]);

  // 정책대출 비교 (디딤돌 일반)
  const policyResult = useMemo(() => {
    if (!compareOpen) return null;
    const input: LoanInput = {
      housePrice,
      deposit,
      income,
      existingDebtPayment: existingDebt,
      loanTerm: Math.min(loanTerm, 20), // 디딤돌 최대 20년 (일반)
      productId: 'didimdol',
      isNewlywedFirstTime: false,
      isLocalHouse: false,
      isCapitalArea: true,
      exclusiveDiscount: null,
      stackableDiscounts: [],
      repaymentType,
    };
    return simulateLoan(input);
  }, [compareOpen, housePrice, deposit, income, existingDebt, loanTerm, repaymentType]);

  /* ── Loading & Error UI ── */

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <RefreshCw size={24} style={{ color: 'var(--text-dim)', animation: 'spin 1s linear infinite' }} />
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>금감원 API 조회 중...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!data || banks.length === 0) {
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
          {data?.message ?? '금감원 서버에서 데이터를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.'}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={fetchRates} style={primaryBtn}>
            <RefreshCw size={14} /> 다시 시도
          </button>
          {onSwitchToPolicy && (
            <button onClick={onSwitchToPolicy} style={secondaryBtn}>정책대출 보기</button>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14, marginBottom: 0 }}>
          정책대출 시뮬레이션은 정상 이용 가능합니다
        </p>
      </div>
    );
  }

  const neededLoan = Math.max(0, housePrice - deposit);

  /* ── Main UI ── */

  return (
    <div>
      {/* 공시 금리 안내 */}
      <div style={{
        padding: 16, borderRadius: 12, marginBottom: 24,
        backgroundColor: 'var(--warning-bg, rgba(200,150,50,0.08))',
        border: '1px solid var(--warning-border, rgba(200,150,50,0.3))',
      }}>
        <button
          onClick={() => setNoticeOpen(!noticeOpen)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--warning, #c89632)' }}>
            <AlertTriangle size={16} /> 공시 금리 안내
          </span>
          {noticeOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {noticeOpen && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            아래 표시된 금리는 금융감독원이 공시한 각 은행의 <strong>평균 금리 범위</strong>입니다.
            실제 적용 금리는 다음에 따라 달라집니다:
            <ul style={{ margin: '6px 0 6px 20px', padding: 0 }}>
              <li>신용점수 (CB사 기준)</li>
              <li>소득 수준 및 직업</li>
              <li>LTV 및 담보 가치</li>
              <li>은행별 우대 조건</li>
            </ul>
            이 시뮬레이션은 <strong>참고용</strong>이며, 실제 대출 조건은 해당 은행에 직접 문의하세요.
          </div>
        )}
      </div>

      {/* 기본 정보 */}
      <Section title="기본 정보">
        <div style={{ marginBottom: 16 }}>
          <LabelRow label="매매가" value={fmtWon(housePrice)} />
          <input type="number" value={housePrice} onChange={(e) => setHousePrice(Math.max(0, Number(e.target.value) || 0))} step={1000} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <LabelRow label="자기자금 (만원)" value={`필요 대출금: ${fmtWon(neededLoan)}`} />
          <input type="number" value={deposit} onChange={(e) => setDeposit(Math.max(0, Math.min(housePrice, Number(e.target.value) || 0)))} step={1000} style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <FieldLabel>부부합산 연소득 (만원)</FieldLabel>
            <input type="number" value={income} onChange={(e) => setIncome(Math.max(0, Number(e.target.value) || 0))} step={100} style={inputStyle} />
          </div>
          <div>
            <FieldLabel>기존 대출 연상환액 (만원)</FieldLabel>
            <input type="number" value={existingDebt} onChange={(e) => setExistingDebt(Math.max(0, Number(e.target.value) || 0))} step={100} style={inputStyle} />
          </div>
        </div>
      </Section>

      {/* 은행 선택 */}
      <Section title="은행 선택" sub={`${banks.length}개 은행 공시 금리`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {banks.flatMap((bank) =>
            bank.products.map((product) => {
              const range = rateType === 'fixed' ? product.fixed : product.variable;
              if (!range) return null;
              const isSelected = selectedBank === bank.bankName && selectedProduct === product.productName;
              const isLowest = data?.summary && (
                rateType === 'fixed'
                  ? data.summary.lowestFixed?.bank === bank.bankName && Math.abs(range.min - data.summary.lowestFixed.rate) < 0.01
                  : data.summary.lowestVariable?.bank === bank.bankName && Math.abs(range.min - data.summary.lowestVariable.rate) < 0.01
              );
              return (
                <button
                  key={`${bank.bankName}-${product.productName}`}
                  onClick={() => { setSelectedBank(bank.bankName); setSelectedProduct(product.productName); }}
                  style={{
                    padding: 14, borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                    border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                    backgroundColor: isSelected ? 'var(--accent-bg)' : 'var(--bg-card)',
                    transition: 'all 0.15s', position: 'relative',
                  }}
                >
                  {isLowest && (
                    <span style={{
                      position: 'absolute', top: 6, right: 6,
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      backgroundColor: 'var(--success-bg, rgba(61,107,68,0.12))',
                      color: 'var(--success, #3D6B44)',
                    }}>
                      최저 공시
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Building2 size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
                      {bank.bankName}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {product.productName}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: isSelected ? 'var(--accent)' : 'var(--text-strong)', fontFamily: MONO }}>
                      {range.min.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>~</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: MONO }}>
                      {range.max.toFixed(2)}%
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </Section>

      {/* 대출 조건 */}
      <Section title="대출 조건">
        <div style={{ marginBottom: 16 }}>
          <FieldLabel style={{ marginBottom: 8 }}>금리 방식</FieldLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['fixed', 'variable'] as const).map((v) => (
              <button key={v} onClick={() => setRateType(v)} style={pillStyle(rateType === v)}>
                {v === 'fixed' ? '고정' : '변동'}
              </button>
            ))}
          </div>
          {rateType === 'variable' && (
            <p style={{ fontSize: 11, color: 'var(--warning, #c89632)', margin: '6px 0 0' }}>
              ⚠️ 변동금리: 스트레스 DSR {STRESS_RATE}%p 가산 적용
            </p>
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel style={{ marginBottom: 8 }}>상환 방식</FieldLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['equal_principal_interest', '원리금균등'], ['equal_principal', '원금균등']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setRepaymentType(v)} style={pillStyle(repaymentType === v)}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel style={{ marginBottom: 8 }}>대출 기간</FieldLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[10, 15, 20, 30, 40].map((t) => (
              <button key={t} onClick={() => setLoanTerm(t)} style={pillStyle(loanTerm === t)}>{t}년</button>
            ))}
          </div>
        </div>
      </Section>

      {/* 규제 지역 */}
      <Section title="규제 지역" sub="매수 지역의 규제 상태를 직접 선택하세요">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {(Object.keys(LTV_BY_REGULATION) as Regulation[]).map((key) => {
            const selected = regulation === key;
            return (
              <button
                key={key}
                onClick={() => setRegulation(key)}
                style={{
                  padding: '12px 10px', borderRadius: 10, cursor: 'pointer',
                  border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
                  backgroundColor: selected ? 'var(--accent-bg)' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                <p style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--accent)' : 'var(--text-primary)', margin: '0 0 4px' }}>
                  {REGULATION_LABELS[key]}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0, fontFamily: MONO }}>
                  LTV {LTV_BY_REGULATION[key]}%
                </p>
              </button>
            );
          })}
        </div>
      </Section>

      {/* 결과 패널 */}
      {!result ? (
        <div style={{
          padding: 32, borderRadius: 14, textAlign: 'center',
          backgroundColor: 'var(--bg-card)', border: '1px dashed var(--border)',
          marginBottom: 24,
        }}>
          <Building2 size={28} style={{ color: 'var(--text-dim)', marginBottom: 10 }} />
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            은행을 선택하면 시뮬레이션 결과가 표시됩니다
          </p>
        </div>
      ) : (
        <div style={{
          padding: 20, borderRadius: 14, marginBottom: 24,
          backgroundColor: 'var(--bg-card)',
          border: result.feasible ? '2px solid var(--success, #3D6B44)' : '2px solid var(--danger, #B93E32)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            {result.feasible
              ? <CheckCircle size={18} style={{ color: 'var(--success)' }} />
              : <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />}
            <span style={{ fontSize: 14, fontWeight: 700, color: result.feasible ? 'var(--success)' : 'var(--danger)' }}>
              {selectedBank} · {selectedProduct}
            </span>
          </div>

          {result.rejectReasons.length > 0 && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 14,
              backgroundColor: 'var(--danger-bg, rgba(185,62,50,0.08))',
            }}>
              {result.rejectReasons.map((r, i) => (
                <p key={i} style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>{r}</p>
              ))}
            </div>
          )}

          {/* 3 핵심 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            <ResultCard label="대출가능액" value={fmtWonShort(result.loanAmount)} sub={`LTV ${result.ltvUsed}%`} />
            <ResultCard
              label="적용 금리"
              value={`${result.appliedRateMin.toFixed(2)}~${result.appliedRateMax.toFixed(2)}%`}
              sub="공시 범위"
            />
            <ResultCard
              label="월 상환액"
              value={
                result.monthlyPaymentMin === result.monthlyPaymentMax
                  ? `${fmt(Math.round(result.monthlyPaymentMin))}만`
                  : `${fmt(Math.round(result.monthlyPaymentMin))}~${fmt(Math.round(result.monthlyPaymentMax))}만`
              }
              highlight
            />
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', margin: '0 0 14px' }}>
            ⚠️ 실제 금리는 개인 조건에 따라 이 범위 내에서 결정됩니다
          </p>

          {/* DSR */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            <DsrRow label="DSR" value={result.dsr} warn={result.dsr > 40} />
            {rateType === 'variable' && (
              <DsrRow label="스트레스 DSR" value={result.stressedDsr} warn={result.stressedDsr > 40} />
            )}
          </div>

          {/* 총 상환액 / 총 이자 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <MiniStat
              label="총 상환액"
              value={`${fmtWonShort(result.totalPaymentMin)}~${fmtWonShort(result.totalPaymentMax)}`}
            />
            <MiniStat
              label="총 이자"
              value={`${fmtWonShort(result.totalInterestMin)}~${fmtWonShort(result.totalInterestMax)}`}
            />
          </div>

          {/* 경고 */}
          {result.warnings.length > 0 && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 14,
              backgroundColor: 'var(--warning-bg, rgba(200,150,50,0.08))',
            }}>
              {result.warnings.map((w, i) => (
                <p key={i} style={{ fontSize: 12, color: 'var(--warning, #c89632)', margin: i > 0 ? '4px 0 0' : 0 }}>
                  ⚠️ {w}
                </p>
              ))}
            </div>
          )}

          {/* 정책대출 비교 버튼 */}
          <button
            onClick={() => setCompareOpen(!compareOpen)}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 12,
              backgroundColor: compareOpen ? 'var(--accent-bg)' : 'var(--border-light)',
              color: compareOpen ? 'var(--accent)' : 'var(--text-primary)',
              border: compareOpen ? '1px solid var(--accent)' : '1px solid var(--border)',
              cursor: 'pointer', fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            💡 정책대출과 비교하기
            {compareOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      )}

      {/* 정책대출 비교 패널 */}
      {compareOpen && result && policyResult && (
        <div style={{
          padding: 20, borderRadius: 14, marginBottom: 24,
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--accent)',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', margin: '0 0 14px' }}>
            정책대출 vs 시중은행 비교
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <CompareCol
              title="정책 (디딤돌 일반)"
              rate={`${policyResult.appliedRate}%`}
              monthly={`${fmt(Math.round(policyResult.monthlyPayment))}만`}
              totalInterest={fmtWonShort(policyResult.totalInterest)}
              highlight
            />
            <CompareCol
              title={`시중 (${selectedBank})`}
              rate={`${result.appliedRateMin.toFixed(2)}~${result.appliedRateMax.toFixed(2)}%`}
              monthly={
                result.monthlyPaymentMin === result.monthlyPaymentMax
                  ? `${fmt(Math.round(result.monthlyPaymentMin))}만`
                  : `${fmt(Math.round(result.monthlyPaymentMin))}~${fmt(Math.round(result.monthlyPaymentMax))}만`
              }
              totalInterest={`${fmtWonShort(result.totalInterestMin)}~${fmtWonShort(result.totalInterestMax)}`}
            />
          </div>

          {policyResult.feasible && result.feasible && (
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 10,
              backgroundColor: 'var(--accent-bg)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', margin: 0, lineHeight: 1.5 }}>
                💡 정책대출 조건 충족 시 월{' '}
                {fmt(Math.max(0, Math.round(result.monthlyPaymentMin - policyResult.monthlyPayment)))}
                ~{fmt(Math.max(0, Math.round(result.monthlyPaymentMax - policyResult.monthlyPayment)))}만원 절약
              </p>
            </div>
          )}

          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.6 }}>
            ※ 정책대출(디딤돌)은 소득·자산·무주택 요건이 있습니다.
            <br />
            정책대출 탭에서 자격 여부를 확인하세요.
          </p>
          {onSwitchToPolicy && (
            <button onClick={onSwitchToPolicy} style={{ ...secondaryBtn, width: '100%', justifyContent: 'center' }}>
              정책대출 탭으로 이동 →
            </button>
          )}
        </div>
      )}

      {/* 푸터 */}
      <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.7 }}>
        ※ 금감원 금융상품통합비교공시 기준 (아파트 담보, 분할상환)
        <br />
        기준일: {data.updatedAt ?? '-'}
      </p>
    </div>
  );
}

/* ── Shared styles ── */

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  fontFamily: MONO,
  backgroundColor: 'var(--border-light)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  outline: 'none',
  boxSizing: 'border-box',
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
  backgroundColor: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
  backgroundColor: 'var(--border-light)', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', cursor: 'pointer',
};

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500,
    cursor: 'pointer', border: 'none',
    backgroundColor: active ? 'var(--accent)' : 'var(--border-light)',
    color: active ? 'white' : 'var(--text-muted)',
    transition: 'background 0.15s',
  };
}

/* ── Sub-components ── */

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: 20, borderRadius: 14, marginBottom: 20,
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
    }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', margin: 0 }}>{title}</h3>
        {sub && <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6, ...style }}>
      {children}
    </label>
  );
}

function LabelRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <FieldLabel style={{ marginBottom: 0 }}>{label}</FieldLabel>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', fontFamily: MONO }}>{value}</span>
    </div>
  );
}

function ResultCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{
      padding: '14px 10px', borderRadius: 12, textAlign: 'center',
      backgroundColor: highlight ? 'var(--accent-bg)' : 'var(--border-light)',
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 6px' }}>{label}</p>
      <p style={{
        fontSize: 16, fontWeight: 800, margin: 0, lineHeight: 1.2,
        color: highlight ? 'var(--accent)' : 'var(--text-strong)',
        fontFamily: MONO,
      }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

function DsrRow({ label, value, warn }: { label: string; value: number; warn: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 10,
      backgroundColor: warn ? 'var(--danger-bg, rgba(185,62,50,0.08))' : 'var(--border-light)',
    }}>
      <Info size={14} style={{ color: warn ? 'var(--danger)' : 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: warn ? 'var(--danger)' : 'var(--text-secondary)' }}>
        {label} <strong style={{ fontFamily: MONO }}>{value}%</strong>
        {warn ? ' — 40% 초과' : ' — 정상'}
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, backgroundColor: 'var(--border-light)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: MONO }}>{value}</span>
    </div>
  );
}

function CompareCol({ title, rate, monthly, totalInterest, highlight }: {
  title: string; rate: string; monthly: string; totalInterest: string; highlight?: boolean;
}) {
  return (
    <div style={{
      padding: '14px 12px', borderRadius: 12,
      backgroundColor: highlight ? 'var(--accent-bg)' : 'var(--border-light)',
      border: highlight ? '1px solid var(--accent)' : '1px solid var(--border)',
    }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: highlight ? 'var(--accent)' : 'var(--text-muted)', margin: '0 0 10px' }}>
        {title}
      </p>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>금리</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', fontFamily: MONO, marginBottom: 8 }}>
        {rate}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>월 상환</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', fontFamily: MONO, marginBottom: 8 }}>
        {monthly}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>총 이자</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', fontFamily: MONO }}>
        {totalInterest}
      </div>
    </div>
  );
}
