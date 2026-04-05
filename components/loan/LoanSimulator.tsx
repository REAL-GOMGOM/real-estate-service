'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { simulateLoan, LoanInput, LoanResult } from '@/lib/loan-calculator';
import {
  LOAN_PRODUCTS,
  EXCLUSIVE_DISCOUNTS,
  STACKABLE_DISCOUNTS,
  LAST_UPDATED,
} from '@/lib/loan-products';
import { Calculator, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Info, Landmark, Building2, Search, X, Loader2 } from 'lucide-react';
import { DISTRICT_CODE } from '@/lib/district-codes';
import BankRateComparison from './BankRateComparison';

type LoanTab = 'policy' | 'bank';

const SAVINGS_IDS = ['savings_5y', 'savings_10y', 'savings_15y'];

const PRODUCT_OPTIONS = [
  { id: 'didimdol', label: '디딤돌 (일반)', isNewlywedFirst: false },
  { id: 'didimdol-newlywed', label: '디딤돌 (생애최초 신혼)', isNewlywedFirst: true },
  { id: 'bogeumjari', label: '보금자리론', isNewlywedFirst: false },
  { id: 'baby-loan', label: '신생아 특례', isNewlywedFirst: false },
] as const;

/* ── Formatters ── */

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

/* ── Debounce hook ── */

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer.current);
  }, [value, ms]);
  return debounced;
}

/* ── Main Component ── */

export default function LoanSimulator() {
  const [activeTab, setActiveTab] = useState<LoanTab>('policy');

  // Inputs
  const [selectedOption, setSelectedOption] = useState('didimdol');
  const [housePrice, setHousePrice] = useState(50000);
  const [deposit, setDeposit] = useState(20000);
  const [income, setIncome] = useState(5000);
  const [existingDebt, setExistingDebt] = useState(0);
  const [loanTerm, setLoanTerm] = useState(20);
  const [isLocalHouse, setIsLocalHouse] = useState(false);
  const [isCapitalArea, setIsCapitalArea] = useState(true);
  const [exclusiveDiscount, setExclusiveDiscount] = useState<string | null>(null);
  const [stackableDiscounts, setStackableDiscounts] = useState<string[]>([]);
  const [repaymentType, setRepaymentType] = useState<'equal_principal_interest' | 'equal_principal' | 'graduated'>('equal_principal_interest');
  const [showSchedule, setShowSchedule] = useState(false);

  // 단지 검색
  const [showSearch, setShowSearch] = useState(false);
  const [searchDistrict, setSearchDistrict] = useState('강남구');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; dong: string; district: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [selectedApt, setSelectedApt] = useState<{ name: string; district: string; count: number; avg: number } | null>(null);
  const [priceEdited, setPriceEdited] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const districtNames = Object.keys(DISTRICT_CODE);

  function handleSearchInput(q: string) {
    setSearchQuery(q);
    clearTimeout(searchTimer.current);
    if (q.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/gap-analysis/search?q=${encodeURIComponent(q)}&district=${encodeURIComponent(searchDistrict)}`);
        const data = await res.json();
        setSearchResults(data.results ?? []);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 400);
  }

  async function handleSelectApt(name: string, district: string) {
    setSearchResults([]);
    setSearchQuery('');
    setPriceLoading(true);
    setPriceEdited(false);
    setSelectedApt({ name, district, count: 0, avg: 0 });
    try {
      const res = await fetch(`/api/transactions?district=${encodeURIComponent(district)}&months=3&aptName=${encodeURIComponent(name)}`);
      const data = await res.json();
      const txns = data?.data?.[0]?.transactions;
      if (txns && txns.length > 0) {
        const prices = txns.map((t: { price: number }) => t.price);
        const avg = Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length);
        setHousePrice(avg);
        setSelectedApt({ name, district, count: txns.length, avg });
      }
    } catch { /* 검색 실패 시 매매가 유지 */ }
    finally {
      setPriceLoading(false);
      setShowSearch(false);
    }
  }

  // Debounced numeric inputs
  const dHousePrice = useDebounce(housePrice, 300);
  const dDeposit = useDebounce(deposit, 300);
  const dIncome = useDebounce(income, 300);
  const dExistingDebt = useDebounce(existingDebt, 300);

  // Derived
  const optionMeta = PRODUCT_OPTIONS.find((o) => o.id === selectedOption)!;
  const productId = selectedOption === 'didimdol-newlywed' ? 'didimdol' : selectedOption;
  const isNewlywedFirst = optionMeta.isNewlywedFirst;
  const isDidimdol = productId === 'didimdol';
  const product = LOAN_PRODUCTS.find((p) => p.id === productId)!;
  const neededLoan = Math.max(0, housePrice - deposit);

  const result: LoanResult = useMemo(() => {
    const input: LoanInput = {
      housePrice: dHousePrice,
      deposit: dDeposit,
      income: dIncome,
      existingDebtPayment: dExistingDebt,
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
  }, [dHousePrice, dDeposit, dIncome, dExistingDebt, loanTerm, productId, isNewlywedFirst, isLocalHouse, isCapitalArea, exclusiveDiscount, stackableDiscounts, repaymentType]);

  // Rate breakdown items (didimdol only)
  const rateBreakdown = useMemo(() => {
    if (!isDidimdol) return null;
    const items: { label: string; value: number; color: string }[] = [
      { label: '기본금리', value: result.baseRate, color: 'var(--text-primary)' },
    ];
    if (isLocalHouse) {
      items.push({ label: '지방 차감', value: -0.2, color: 'var(--success)' });
    }
    if (result.discountRate > (isLocalHouse ? 0.2 : 0)) {
      const pureDiscount = result.discountRate - (isLocalHouse ? 0.2 : 0);
      if (pureDiscount > 0) {
        items.push({ label: '우대금리', value: -pureDiscount, color: 'var(--success)' });
      }
    }
    items.push({ label: '최종금리', value: result.appliedRate, color: 'var(--accent)' });
    return items;
  }, [isDidimdol, result.baseRate, result.discountRate, result.appliedRate, isLocalHouse]);

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

        {/* ── 탭 ── */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 24, padding: 4,
          borderRadius: 12, backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)', width: 'fit-content',
        }}>
          <button
            onClick={() => setActiveTab('policy')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              backgroundColor: activeTab === 'policy' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'policy' ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            <Landmark size={15} />
            정책대출
          </button>
          <button
            onClick={() => setActiveTab('bank')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              backgroundColor: activeTab === 'bank' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'bank' ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
              position: 'relative',
            }}
          >
            <Building2 size={15} />
            시중은행
          </button>
        </div>

        {activeTab === 'bank' && <BankRateComparison onSwitchToPolicy={() => setActiveTab('policy')} />}

        {activeTab === 'policy' && (<>
        {/* ── 기본 정보 ── */}
        <Section title="기본 정보">
          {/* 단지 검색 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <FieldLabel>매매가</FieldLabel>
              <button
                onClick={() => setShowSearch(!showSearch)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  backgroundColor: showSearch ? 'var(--accent)' : 'var(--border-light)',
                  color: showSearch ? '#fff' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <Search size={12} />
                단지 검색
              </button>
            </div>

            {showSearch && (
              <div style={{
                padding: 14, borderRadius: 12, marginBottom: 12,
                backgroundColor: 'var(--border-light)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select
                    value={searchDistrict}
                    onChange={(e) => { setSearchDistrict(e.target.value); setSearchResults([]); }}
                    style={{
                      padding: '8px 10px', borderRadius: 8, fontSize: 12,
                      backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
                      border: '1px solid var(--border)', outline: 'none', cursor: 'pointer',
                      minWidth: 100,
                    }}
                  >
                    {districtNames.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchInput(e.target.value)}
                      placeholder="아파트명 (예: 래미안)"
                      style={{
                        ...inputStyle,
                        fontSize: 13, fontFamily: 'inherit', fontWeight: 400,
                        paddingRight: 32,
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                        style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                          color: 'var(--text-dim)',
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {searchLoading && (
                  <div style={{ padding: 12, textAlign: 'center' }}>
                    <Loader2 size={16} style={{ color: 'var(--text-dim)', animation: 'spin 1s linear infinite' }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                )}

                {!searchLoading && searchResults.length > 0 && (
                  <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 8 }}>
                    {searchResults.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleSelectApt(r.name, r.district)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '8px 10px', border: 'none', cursor: 'pointer',
                          backgroundColor: 'var(--bg-card)', fontSize: 13,
                          color: 'var(--text-primary)', borderBottom: '1px solid var(--border)',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent-bg)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-card)'; }}
                      >
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{r.dong}</span>
                      </button>
                    ))}
                  </div>
                )}

                {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', margin: '8px 0 0' }}>
                    검색 결과가 없습니다
                  </p>
                )}
              </div>
            )}

            {/* 선택된 단지 표시 */}
            {selectedApt && (
              <div style={{
                marginBottom: 12, padding: '14px 18px', borderRadius: 12,
                backgroundColor: 'var(--accent-bg)',
                borderLeft: '4px solid var(--accent)',
                position: 'relative',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{selectedApt.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedApt.district}</span>
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', margin: '0 0 8px' }}>
                  최근 3개월 실거래 평균가 적용 중
                </p>
                {priceLoading ? (
                  <Loader2 size={14} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                ) : selectedApt.count > 0 && (
                  <div style={{ borderTop: '1px solid var(--accent-border, rgba(196,101,74,0.2))', paddingTop: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: MONO }}>
                      거래 {selectedApt.count}건 평균 &middot;{' '}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', fontFamily: MONO }}>
                      {fmtWon(selectedApt.avg)}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setSelectedApt(null)}
                  style={{
                    position: 'absolute', top: 12, right: 12,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-dim)', padding: 2, fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}
                >
                  <X size={14} /> 해제
                </button>
              </div>
            )}
          </div>

          {/* 매매가 입력 */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>직접 입력</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={monoAccent}>{fmtWon(housePrice)}</span>
                {selectedApt && selectedApt.count > 0 && !priceEdited && (
                  <span style={{
                    fontSize: 11, color: 'var(--accent)', fontWeight: 600,
                    backgroundColor: 'var(--accent-bg)', padding: '2px 6px', borderRadius: 4,
                  }}>
                    실거래 평균
                  </span>
                )}
              </span>
            </div>
            {/* 자동 입력 안내 */}
            {selectedApt && selectedApt.count > 0 && (
              <p style={{ fontSize: 12, marginBottom: 6, margin: '0 0 6px' , color: priceEdited ? 'var(--text-muted)' : '#22C55E' }}>
                {priceEdited
                  ? '\u270F\uFE0F 매매가가 직접 입력 값으로 변경되었습니다'
                  : `\u2705 ${selectedApt.name}의 최근 3개월 실거래 평균가(${fmtWon(selectedApt.avg)})가 자동 입력되었습니다. 직접 수정도 가능합니다.`}
              </p>
            )}
            <input
              type="number"
              value={housePrice}
              onChange={(e) => { if (selectedApt) setPriceEdited(true); setHousePrice(Math.max(0, Number(e.target.value) || 0)); }}
              step={1000}
              style={inputStyle}
            />
            <input
              type="range"
              min={10000}
              max={300000}
              step={1000}
              value={housePrice}
              onChange={(e) => { if (selectedApt) setPriceEdited(true); setHousePrice(Number(e.target.value)); }}
              style={sliderStyle}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>1억</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>30억</span>
            </div>
          </div>

          {/* 자기자금 */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <FieldLabel>자기자금 (만원)</FieldLabel>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                필요 대출금: <strong style={monoAccent}>{fmtWon(neededLoan)}</strong>
              </span>
            </div>
            <input
              type="number"
              value={deposit}
              onChange={(e) => setDeposit(Math.max(0, Math.min(housePrice, Number(e.target.value) || 0)))}
              step={1000}
              style={inputStyle}
            />
          </div>

          {/* 연소득 + 기존대출 2열 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <FieldLabel style={{ marginBottom: 6 }}>부부합산 연소득 (만원)</FieldLabel>
              <input type="number" value={income} onChange={(e) => setIncome(Math.max(0, Number(e.target.value) || 0))} step={100} style={inputStyle} />
            </div>
            <div>
              <FieldLabel style={{ marginBottom: 6 }}>기존 대출 연상환액 (만원)</FieldLabel>
              <input type="number" value={existingDebt} onChange={(e) => setExistingDebt(Math.max(0, Number(e.target.value) || 0))} step={100} style={inputStyle} />
            </div>
          </div>
        </Section>

        {/* ── 상품 선택 ── */}
        <Section title="상품 선택">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PRODUCT_OPTIONS.map((opt) => {
              const sel = selectedOption === opt.id;
              return (
                <label key={opt.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
                  border: sel ? '2px solid var(--accent)' : '1px solid var(--border)',
                  backgroundColor: sel ? 'var(--accent-bg)' : 'transparent',
                  transition: 'all 0.15s',
                }}>
                  <input type="radio" name="product" checked={sel} onChange={() => handleOptionChange(opt.id)} style={radioStyle} />
                  <span style={{ fontSize: 14, fontWeight: sel ? 600 : 400, color: sel ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, backgroundColor: 'var(--border-light)' }}>
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

        {/* ── 대출 조건 ── */}
        <Section title="대출 조건">
          <div style={{ marginBottom: 18 }}>
            <FieldLabel style={{ marginBottom: 8 }}>대출기간</FieldLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {product.terms.map((t) => (
                <button key={t} onClick={() => setLoanTerm(t)} style={pillStyle(loanTerm === t)}>{t}년</button>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel style={{ marginBottom: 8 }}>상환방식</FieldLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([['equal_principal_interest', '원리금균등'], ['equal_principal', '원금균등'], ['graduated', '체증식']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setRepaymentType(v)} style={pillStyle(repaymentType === v)}>{l}</button>
              ))}
            </div>
            {/* 선택된 상환방식 설명 */}
            <RepaymentDesc type={repaymentType} />
          </div>
        </Section>

        {/* ── 우대금리 (디딤돌) ── */}
        {isDidimdol && (
          <Section title="우대금리">
            <div style={{ marginBottom: 18 }}>
              <FieldLabel style={{ marginBottom: 8 }}>택1 우대 (하나만 선택)</FieldLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={radioRowStyle(exclusiveDiscount === null)}>
                  <input type="radio" name="exclusive" checked={exclusiveDiscount === null} onChange={() => setExclusiveDiscount(null)} style={radioStyle} />
                  <span style={{ fontSize: 13, color: exclusiveDiscount === null ? 'var(--accent)' : 'var(--text-secondary)' }}>없음</span>
                </label>
                {EXCLUSIVE_DISCOUNTS.map((d) => {
                  const sel = exclusiveDiscount === d.id;
                  return (
                    <label key={d.id} style={radioRowStyle(sel)}>
                      <input type="radio" name="exclusive" checked={sel} onChange={() => setExclusiveDiscount(d.id)} style={radioStyle} />
                      <span style={{ fontSize: 13, color: sel ? 'var(--accent)' : 'var(--text-secondary)', flex: 1 }}>{d.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: sel ? 'var(--accent)' : 'var(--text-dim)', fontFamily: MONO }}> -{d.rate}%p</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <FieldLabel style={{ marginBottom: 8 }}>중복 가능 우대 (복수 선택)</FieldLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {STACKABLE_DISCOUNTS.map((d) => {
                  const chk = stackableDiscounts.includes(d.id);
                  return (
                    <label key={d.id} style={checkRowStyle(chk)}>
                      <input type="checkbox" checked={chk} onChange={() => toggleStackable(d.id)} style={{ accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer' }} />
                      <span style={{ fontSize: 13, color: chk ? 'var(--accent)' : 'var(--text-secondary)', flex: 1 }}>
                        {d.label}
                        {d.note && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>({d.note})</span>}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: chk ? 'var(--accent)' : 'var(--text-dim)', fontFamily: MONO }}>-{d.rate}%p</span>
                    </label>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, marginBottom: 0 }}>* 청약저축 (5년/10년/15년)은 1개만 선택 가능</p>
            </div>
          </Section>
        )}

        {/* ── 지역 ── */}
        <Section title="지역">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ToggleRow label="지방 소재 주택" sub={isDidimdol ? '(-0.2%p 우대)' : undefined} checked={isLocalHouse} onChange={setIsLocalHouse} />
            <ToggleRow label="수도권 여부" sub={isDidimdol && isNewlywedFirst ? '(생애최초 LTV 70% 제한)' : undefined} checked={isCapitalArea} onChange={setIsCapitalArea} />
          </div>
        </Section>

        {/* ══════ 결과 패널 ══════ */}
        <div style={{
          padding: 24,
          borderRadius: 16,
          border: result.feasible
            ? '2px solid var(--success-border, var(--success))'
            : '2px solid var(--danger-border, var(--danger))',
          backgroundColor: 'var(--bg-card)',
          marginBottom: 24,
        }}>
          {/* 가능/불가 배지 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            {result.feasible
              ? <CheckCircle size={20} style={{ color: 'var(--success)' }} />
              : <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />}
            <span style={{ fontSize: 15, fontWeight: 700, color: result.feasible ? 'var(--success)' : 'var(--danger)' }}>
              {result.feasible ? '대출 가능' : '대출 요건 미충족'}
            </span>
          </div>

          {/* 경고 박스 */}
          {result.rejectReasons.length > 0 && (
            <div style={{
              padding: '12px 16px', borderRadius: 12, marginBottom: 18,
              backgroundColor: 'var(--danger-bg, rgba(185, 62, 50, 0.08))',
              border: '1px solid var(--danger-border, var(--danger))',
            }}>
              {result.rejectReasons.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: i > 0 ? 6 : 0 }}>
                  <AlertTriangle size={13} style={{ color: 'var(--danger)', marginTop: 1, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--danger)', lineHeight: 1.4 }}>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* 핵심 3카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
            <ResultCard label="대출금액" value={fmtWonShort(result.loanAmount)} sub={`LTV ${result.ltvUsed}%`} />
            <ResultCard label="적용금리" value={`${result.appliedRate}%`} sub={isDidimdol ? `기본 ${result.baseRate}%` : '고정금리'} />
            <ResultCard
              label={repaymentType === 'graduated' ? '월 상환액 (1년차)' : '월 상환액'}
              value={`${fmt(Math.round(result.monthlyPayment))}만`}
              highlight
            />
          </div>

          {/* 체증식 연차별 변화 */}
          {repaymentType === 'graduated' && result.graduatedYears && (
            <div style={{
              padding: '14px 16px', borderRadius: 12, marginBottom: 18,
              backgroundColor: 'var(--border-light)',
            }}>
              <FieldLabel style={{ marginBottom: 10 }}>연차별 월 납입액 변화</FieldLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.graduatedYears.map((g, i) => (
                  <div key={g.year} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>→</span>}
                    <div style={{
                      padding: '6px 12px', borderRadius: 8,
                      backgroundColor: i === 0 ? 'var(--accent-bg)' : 'var(--bg-card)',
                      border: i === 0 ? '1px solid var(--accent)' : '1px solid var(--border)',
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>{g.year}년차</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: i === 0 ? 'var(--accent)' : 'var(--text-strong)', fontFamily: MONO }}>
                        {fmt(Math.round(g.monthlyPayment))}만
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
                체증식은 초기 부담이 적고 소득 증가에 맞춰 상환액이 늘어나는 방식입니다
              </p>
              {isDidimdol && (
                <p style={{ fontSize: 11, color: 'var(--warning, #c89632)', marginTop: 4, marginBottom: 0 }}>
                  * 디딤돌 체증식은 고정금리만 가능합니다
                </p>
              )}
            </div>
          )}

          {/* 금리 분해 바 (디딤돌) */}
          {rateBreakdown && (
            <div style={{
              padding: '14px 16px', borderRadius: 12, marginBottom: 18,
              backgroundColor: 'var(--border-light)',
            }}>
              <FieldLabel style={{ marginBottom: 10 }}>금리 분해</FieldLabel>
              {/* 시각 바 */}
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12, backgroundColor: 'var(--border)' }}>
                <div style={{
                  width: `${(result.appliedRate / result.baseRate) * 100}%`,
                  backgroundColor: 'var(--accent)',
                  borderRadius: 4,
                  transition: 'width 0.3s',
                }} />
              </div>
              {/* 항목 */}
              {rateBreakdown.map((item, i) => {
                const isLast = i === rateBreakdown.length - 1;
                return (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '4px 0',
                    borderTop: isLast ? '1px solid var(--border)' : 'none',
                    marginTop: isLast ? 6 : 0,
                    paddingTop: isLast ? 8 : 4,
                  }}>
                    <span style={{ fontSize: 13, color: isLast ? 'var(--text-strong)' : 'var(--text-secondary)', fontWeight: isLast ? 700 : 400 }}>
                      {item.label}
                    </span>
                    <span style={{
                      fontSize: isLast ? 16 : 13,
                      fontWeight: isLast ? 800 : 600,
                      color: item.color,
                      fontFamily: MONO,
                    }}>
                      {item.value > 0 && !isLast ? '' : ''}{item.value > 0 ? `${item.value}%` : `${item.value}%p`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 상환 요약 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <MiniStat label="총 상환액" value={fmtWon(result.totalPayment)} />
            <MiniStat label="총 이자" value={fmtWon(result.totalInterest)} />
          </div>

          {/* DSR */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px', borderRadius: 10,
            backgroundColor: result.dsr > 40
              ? 'var(--danger-bg, rgba(185, 62, 50, 0.08))'
              : result.dsr > 30
                ? 'var(--warning-bg, rgba(200, 150, 50, 0.08))'
                : 'var(--border-light)',
          }}>
            <Info size={14} style={{
              color: result.dsr > 40 ? 'var(--danger)' : result.dsr > 30 ? 'var(--warning, #c89632)' : 'var(--text-muted)',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 13,
              color: result.dsr > 40 ? 'var(--danger)' : result.dsr > 30 ? 'var(--warning, #c89632)' : 'var(--text-secondary)',
            }}>
              DSR <strong style={{ fontFamily: MONO }}>{result.dsr}%</strong>
              {result.dsr > 40 ? ' — 40% 초과, 심사 제한 가능' : result.dsr > 30 ? ' — 주의 구간' : ' — 40% 이내'}
            </span>
          </div>
        </div>

        {/* ── 상환 스케줄 ── */}
        {result.schedule.length > 0 && (
          <div style={{
            borderRadius: 14, backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 24,
          }}>
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              style={{
                width: '100%', padding: '14px 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
                color: 'var(--text-strong)', fontSize: 14, fontWeight: 600,
              }}
            >
              상환 스케줄 (첫 12개월)
              {showSchedule ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showSchedule && (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 420 }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--border-light)' }}>
                      {['회차', '원금', '이자', '월납입', '잔여원금'].map((h) => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
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
                        <td style={{ ...tdMonoStyle, color: 'var(--text-strong)', fontWeight: 700 }}>{fmt(Math.round(s.payment))}</td>
                        <td style={{ ...tdMonoStyle, color: 'var(--text-muted)' }}>{fmt(Math.round(s.remainingBalance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 면책 문구 */}
        <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.7, padding: '0 8px' }}>
          ※ 본 계산은 참고용이며 실제 대출 조건은 금융기관에 확인하세요.
          <br />
          금리 기준일: {LAST_UPDATED} | 한국주택금융공사 공시
        </p>
        </>)}
      </div>
    </main>
  );
}

/* ── Constants ── */

const MONO = "'Roboto Mono', var(--font-mono, monospace)";

const monoAccent: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: 'var(--accent)',
  fontFamily: MONO,
};

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

const sliderStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 8,
  accentColor: 'var(--accent)',
  cursor: 'pointer',
  height: 6,
  touchAction: 'none',
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

function radioRowStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
    border: selected ? '1.5px solid var(--accent)' : '1px solid var(--border)',
    backgroundColor: selected ? 'var(--accent-bg)' : 'transparent',
    transition: 'all 0.15s',
  };
}

function checkRowStyle(checked: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
    border: checked ? '1.5px solid var(--accent)' : '1px solid var(--border)',
    backgroundColor: checked ? 'var(--accent-bg)' : 'transparent',
    transition: 'all 0.15s',
  };
}

const radioStyle: React.CSSProperties = { accentColor: 'var(--accent)', width: 16, height: 16, cursor: 'pointer' };

const tdStyle: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)' };

const tdMonoStyle: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', color: 'var(--text-primary)', fontFamily: MONO };

/* ── Sub-components ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 20, borderRadius: 14, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)', margin: '0 0 18px' }}>{title}</h2>
      {children}
    </div>
  );
}

function FieldLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', ...style }}>{children}</label>;
}

function ToggleRow({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
      cursor: 'pointer', backgroundColor: checked ? 'var(--accent-bg)' : 'transparent', transition: 'all 0.15s',
    }}>
      <span>
        <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
        {sub && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 6 }}>{sub}</span>}
      </span>
      <div
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
        style={{
          width: 40, height: 22, borderRadius: 11, flexShrink: 0,
          backgroundColor: checked ? 'var(--accent)' : 'var(--border)',
          position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: 9, backgroundColor: 'white',
          position: 'absolute', top: 2, left: checked ? 20 : 2,
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </label>
  );
}

function ResultCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{
      padding: '16px 10px', borderRadius: 12, textAlign: 'center',
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

const REPAYMENT_DESCRIPTIONS: Record<string, { title: string; desc: string; pros: string; cons: string }> = {
  equal_principal_interest: {
    title: '원리금균등',
    desc: '매달 동일한 금액(원금+이자)을 상환합니다.',
    pros: '매달 일정액 → 가계 지출 계획 쉬움',
    cons: '초기에 이자 비중 높고, 총 이자가 원금균등보다 많음',
  },
  equal_principal: {
    title: '원금균등',
    desc: '매달 동일한 원금 + 남은 잔액 기준 이자를 상환합니다.',
    pros: '총 이자 부담이 가장 적음',
    cons: '초기 상환액이 가장 높아 부담 큼',
  },
  graduated: {
    title: '체증식',
    desc: '초기 상환액이 적고, 매년 일정 비율로 상환액이 증가합니다.',
    pros: '사회 초년생 등 초기 소득이 적을 때 유리',
    cons: '후반기 상환 부담 크고, 총 이자가 가장 많음',
  },
};

function RepaymentDesc({ type }: { type: string }) {
  const info = REPAYMENT_DESCRIPTIONS[type];
  if (!info) return null;
  return (
    <div style={{
      marginTop: 10, padding: '12px 16px', borderRadius: 10,
      backgroundColor: 'var(--accent-bg)', lineHeight: 1.7,
      transition: 'opacity 0.2s',
    }}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px' }}>{info.desc}</p>
      <p style={{ fontSize: 12, color: '#22C55E', margin: '0 0 2px' }}>&#x2705; {info.pros}</p>
      <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>&#x26A0;&#xFE0F; {info.cons}</p>
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
      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', fontFamily: MONO }}>{value}</span>
    </div>
  );
}
