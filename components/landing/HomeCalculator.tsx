'use client';

import { useEffect, useMemo, useState } from 'react';
import { calcEqualPrincipalInterest } from '@/lib/loan-calculator';

/**
 * 내집마련 계산기 카드 — 홈 대시보드 (2a 시안).
 *
 * 슬라이더(집값·자기자본 비율·금리) + 상환 기간 세그먼트 → 원리금 균등 월 상환액 즉시 계산.
 * 계산은 기존 lib/loan-calculator 의 calcEqualPrincipalInterest 재사용 (순수 클라이언트).
 * 기본 금리는 ECOS 예금은행 대출평균금리 최신값으로 초기화 (사용자가 건드리기 전까지만).
 */

const YEAR_OPTIONS = [10, 20, 30, 40] as const;
type YearOption = (typeof YEAR_OPTIONS)[number];

const DEFAULT_PRICE_EOK = 15;  // 집값 기본값 (억)
const DEFAULT_DOWN_PCT  = 40;  // 자기자본 비율 기본값 (%)
const DEFAULT_RATE_PCT  = 4.2; // 대출 금리 기본값 (연 %) — 라이브 도착 전 표본
const DEFAULT_YEARS: YearOption = 30;
const RATE_MIN = 2;            // 금리 슬라이더 하한 (%)
const RATE_MAX = 7;            // 금리 슬라이더 상한 (%)

/** 원 단위 금액 → "7.2억"/"12억" 표기 (10억 이상은 정수) */
function fmtEokWon(won: number): string {
  const eok = won / 1e8;
  if (eok >= 10) return `${Math.round(eok)}억`;
  return `${(Math.round(eok * 10) / 10).toFixed(1)}억`;
}

export default function HomeCalculator() {
  const [price, setPrice] = useState(DEFAULT_PRICE_EOK);
  const [down, setDown]   = useState(DEFAULT_DOWN_PCT);
  const [rate, setRate]   = useState(DEFAULT_RATE_PCT);
  const [years, setYears] = useState<YearOption>(DEFAULT_YEARS);

  // 기본 금리 라이브화 — /api/loan/rate-history 의 예금은행 대출평균금리(신규취급액) 최신값.
  // 응답 키 cofix 는 과거 명칭 유지분으로, 실제 시리즈는 121Y006/BECBLA01 (커밋 21634cd).
  // 사용자가 이미 슬라이더를 움직였으면(기본값에서 벗어남) 덮어쓰지 않는다.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/loan/rate-history')
      .then((r) => r.json())
      .then((json: { cofix?: { points?: Array<{ period: string; rate: number }> } }) => {
        if (cancelled) return;
        const pts = json.cofix?.points ?? [];
        const latest = pts[pts.length - 1]?.rate;
        if (typeof latest === 'number' && latest >= RATE_MIN && latest <= RATE_MAX) {
          const live = Math.round(latest * 10) / 10;
          setRate((cur) => (cur === DEFAULT_RATE_PCT ? live : cur));
        }
      })
      .catch(() => { /* 실패 시 표본 금리 유지 */ });
    return () => { cancelled = true; };
  }, []);

  const out = useMemo(() => {
    const priceWon   = price * 1e8;
    const equityWon  = priceWon * (down / 100);
    const loanWon    = priceWon - equityWon;
    const months     = years * 12;
    const monthlyWon = calcEqualPrincipalInterest(loanWon, rate, months);
    return {
      monthly:  Math.round(monthlyWon / 1e4).toLocaleString(),
      loan:     fmtEokWon(loanWon),
      equity:   fmtEokWon(equityWon),
      interest: fmtEokWon(monthlyWon * months - loanWon),
      ltv:      `${100 - down}%`,
    };
  }, [price, down, rate, years]);

  const rateDisplay = Math.round(rate * 10) / 10;

  const sliders = [
    { label: '집값',        display: `${price}억`,       min: 3,  max: 50, step: 1,   value: price, onChange: setPrice },
    { label: '자기자본 비율', display: `${down}%`,        min: 10, max: 80, step: 5,   value: down,  onChange: setDown },
    { label: '대출 금리',    display: `${rateDisplay}%`, min: RATE_MIN, max: RATE_MAX, step: 0.1, value: rate, onChange: setRate },
  ];

  const results = [
    { label: '필요 대출액', value: out.loan },
    { label: 'LTV',        value: out.ltv },
    { label: '자기자본',    value: out.equity },
    { label: '총 이자',     value: out.interest },
  ];

  return (
    <div className="nz-calc" style={{ background: '#0B1524', borderRadius: 18, padding: 22, color: '#FFFFFF', minWidth: 0 }}>
      <style>{`
        .nz-calc-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:center}
        @media (max-width:760px){.nz-calc-grid{grid-template-columns:minmax(0,1fr)}}
        .nz-range{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:99px;background:#DFE4EE;outline:none;cursor:pointer}
        .nz-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:#1B4DDB;border:3px solid #fff;box-shadow:0 2px 6px rgba(27,77,219,.4);cursor:pointer}
        .nz-range::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#1B4DDB;border:3px solid #fff;cursor:pointer}
      `}</style>
      <div className="nz-calc-grid">
        {/* 좌열 — 컨트롤 */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-sg, ui-monospace, monospace)',
            fontSize: 10.5, letterSpacing: '0.12em', color: '#7E8AA6', fontWeight: 600,
          }}>
            MY HOME CALCULATOR
          </div>
          <h3 style={{ margin: '6px 0 16px', fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: '#FFFFFF' }}>
            내집마련 계산기
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sliders.map((s) => (
              <div key={s.label}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#C7CEDC' }}>{s.label}</span>
                  <span style={{ fontFamily: 'var(--font-sg)', fontSize: 13.5, fontWeight: 700, color: '#FFFFFF' }}>{s.display}</span>
                </div>
                <input
                  type="range"
                  className="nz-range"
                  min={s.min} max={s.max} step={s.step} value={s.value}
                  aria-label={s.label}
                  onChange={(e) => s.onChange(Number(e.target.value))}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              {YEAR_OPTIONS.map((y) => {
                const active = y === years;
                return (
                  <button
                    key={y}
                    onClick={() => setYears(y)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', transition: '.15s', fontFamily: 'inherit',
                      background: active ? '#1B4DDB' : 'rgba(255,255,255,0.05)',
                      color:      active ? '#FFFFFF' : '#AEB6C6',
                      border: `1px solid ${active ? '#1B4DDB' : 'rgba(255,255,255,0.14)'}`,
                    }}
                  >
                    {y}년
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 우열 — 결과 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 13, color: '#AEB6C6' }}>월 예상 상환액</div>
            <div style={{ marginTop: 4 }}>
              <span style={{ fontFamily: 'var(--font-sg)', fontSize: 34, fontWeight: 700, color: '#8FB0FF', letterSpacing: '-0.02em' }}>
                {out.monthly}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#8FB0FF', marginLeft: 2 }}>만원</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
            {results.map((r) => (
              <div key={r.label}>
                <div style={{ fontSize: 12, color: '#8A93A3' }}>{r.label}</div>
                <div style={{ fontFamily: 'var(--font-sg)', fontSize: 18, fontWeight: 700, marginTop: 4 }}>{r.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
