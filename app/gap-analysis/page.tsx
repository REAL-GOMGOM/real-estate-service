'use client';

import { useState, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/layout/Header';
import { Search, TrendingUp, TrendingDown, Minus, AlertTriangle, BarChart2 } from 'lucide-react';
import type { GapResult, ComplexSearchResult } from '@/types/gap-analysis';

const GapChart = dynamic(() => import('@/components/gap-analysis/GapChart'), { ssr: false });

const DISTRICTS = ['강남구', '서초구', '송파구', '용산구', '마포구', '성동구', '강동구', '양천구', '노원구', '성남시 분당구', '과천시'];

function ComplexSearchInput({
  label,
  district,
  onDistrictChange,
  onSelect,
  selected,
}: {
  label: string;
  district: string;
  onDistrictChange: (d: string) => void;
  onSelect: (c: ComplexSearchResult) => void;
  selected: ComplexSearchResult | null;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ComplexSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string, d: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/gap-analysis/search?q=${encodeURIComponent(q)}&district=${encodeURIComponent(d)}`);
      const json = await res.json();
      setResults(json.results || []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  return (
    <div style={{ padding: '16px', borderRadius: '14px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px' }}>{label}</p>

      {selected ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)' }}>{selected.name}</p>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{selected.district} {selected.dong}</p>
          </div>
          <button onClick={() => { onSelect(null as any); setQuery(''); setResults([]); }}
            style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
            변경
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select value={district} onChange={(e) => onDistrictChange(e.target.value)}
              style={{ padding: '8px', borderRadius: '8px', fontSize: '13px', backgroundColor: 'var(--btn-bg)', color: 'var(--text-primary)', border: '1px solid var(--border)', outline: 'none' }}>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); search(e.target.value, district); }}
                placeholder="단지명 입력 (예: 래미안)"
                style={{ width: '100%', padding: '8px 8px 8px 30px', borderRadius: '8px', fontSize: '13px', backgroundColor: 'var(--btn-bg)', color: 'var(--text-primary)', border: '1px solid var(--border)', outline: 'none' }}
              />
            </div>
          </div>
          {loading && <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>검색 중...</p>}
          {results.length > 0 && (
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {results.map((r) => (
                <button key={r.id} onClick={() => onSelect(r)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{r.dong} · {r.sizes.map((s) => `${Math.round(s)}㎡`).join(', ')}</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GapContent() {
  const [districtA, setDistrictA] = useState('강남구');
  const [districtB, setDistrictB] = useState('강남구');
  const [complexA, setComplexA] = useState<ComplexSearchResult | null>(null);
  const [complexB, setComplexB] = useState<ComplexSearchResult | null>(null);
  const [result, setResult] = useState<GapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    if (!complexA) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gap-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complexA: { district: districtA, name: complexA.name },
          complexB: complexB ? { district: districtB, name: complexB.name } : undefined,
          period: 24,
        }),
      });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setResult(json);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const signalConfig = {
    undervalued: { label: '저평가', color: 'var(--success-text, #3D6B44)', bg: 'var(--success-bg, #E8F0E9)', icon: TrendingUp },
    overvalued: { label: '고평가', color: 'var(--danger-text, #B93E32)', bg: 'var(--danger-bg, #FDE8E6)', icon: TrendingDown },
    normal: { label: '정상', color: 'var(--text-muted)', bg: 'var(--btn-bg)', icon: Minus },
  };

  return (
    <main style={{ paddingTop: '64px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '28px 20px' }}>
        <h1 style={{ fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '4px' }}>
          갭 분석
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' }}>
          두 단지의 실거래가 갭을 비교하여 저평가/고평가를 판단합니다
        </p>

        {/* 단지 선택 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '16px', marginBottom: '20px' }}>
          <ComplexSearchInput label="기준 단지 (A)" district={districtA} onDistrictChange={setDistrictA} onSelect={setComplexA} selected={complexA} />
          <ComplexSearchInput label="비교 단지 (B) — 선택" district={districtB} onDistrictChange={setDistrictB} onSelect={setComplexB} selected={complexB} />
        </div>

        {/* 분석 버튼 */}
        <button
          onClick={analyze}
          disabled={!complexA || loading}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: 700,
            backgroundColor: complexA ? 'var(--accent)' : 'var(--btn-bg)',
            color: complexA ? '#FFFFFF' : 'var(--text-dim)',
            border: 'none', cursor: complexA ? 'pointer' : 'not-allowed',
            marginBottom: '24px',
          }}
        >
          {loading ? '분석 중...' : complexB ? `${complexA?.name || ''} vs ${complexB.name} 갭 분석` : `${complexA?.name || '단지를 선택하세요'} 시세 분석`}
        </button>

        {error && (
          <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: 'var(--danger-bg, #FDE8E6)', color: 'var(--danger-text, #B93E32)', fontSize: '14px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        {/* 결과 */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* 갭투자 시뮬레이션 카드 */}
            {result.latestPrice && result.rentAvg && (
              <div style={{ padding: '24px', borderRadius: '14px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '16px' }}>
                  {result.complexA.name} 갭투자 분석
                </h3>

                {/* 핵심 수치 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: '매매가', value: `${(result.latestPrice / 10000).toFixed(1)}억`, color: 'var(--text-strong)' },
                    { label: '전세가', value: `${(result.rentAvg / 10000).toFixed(1)}억`, color: 'var(--accent)' },
                    { label: '갭 (투자금)', value: `${((result.investmentGap || 0) / 10000).toFixed(1)}억`, color: '#D4A853' },
                    { label: '전세가율', value: `${result.rentRatio}%`, color: (result.rentRatio || 0) >= 70 ? 'var(--success-text, #3D6B44)' : 'var(--danger-text, #B93E32)' },
                  ].map((item) => (
                    <div key={item.label} style={{ padding: '14px', borderRadius: '12px', backgroundColor: 'var(--btn-bg)', textAlign: 'center' }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>{item.label}</p>
                      <p style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace', color: item.color }}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* 수익률 시뮬레이션 */}
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px' }}>매매가 상승 시 수익률 시뮬레이션</p>
                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '8px 14px', backgroundColor: 'var(--btn-bg)', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)' }}>상승액</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)', textAlign: 'center' }}>매도 시 시세</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)', textAlign: 'right' }}>수익률</span>
                  </div>
                  {[5000, 10000, 15000, 20000, 30000].map((rise) => {
                    const gap = result.investmentGap || 1;
                    const roi = ((rise / gap) * 100);
                    return (
                      <div key={rise} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>+{(rise / 10000).toFixed(1)}억</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', textAlign: 'center', fontFamily: 'Roboto Mono, monospace' }}>
                          {((result.latestPrice! + rise) / 10000).toFixed(1)}억
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 700, textAlign: 'right', fontFamily: 'Roboto Mono, monospace', color: roi > 0 ? 'var(--up-color)' : 'var(--down-color)' }}>
                          {roi > 0 ? '+' : ''}{roi.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 전세가율 판정 */}
                <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '10px', backgroundColor: (result.rentRatio || 0) >= 70 ? 'var(--success-bg, #E8F0E9)' : 'var(--danger-bg, #FDE8E6)', fontSize: '13px' }}>
                  {(result.rentRatio || 0) >= 70
                    ? <span style={{ color: 'var(--success-text, #3D6B44)' }}>전세가율 {result.rentRatio}% — 갭투자 적합 구간 (투자금 {((result.investmentGap || 0) / 10000).toFixed(1)}억)</span>
                    : <span style={{ color: 'var(--danger-text, #B93E32)' }}>전세가율 {result.rentRatio}% — 갭이 커서 높은 투자금 필요 ({((result.investmentGap || 0) / 10000).toFixed(1)}억)</span>
                  }
                </div>

                <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '10px' }}>
                  매매 {result.tradeCount}건 · 전세 {result.rentCount}건 기준 (최근 6개월)
                </p>
              </div>
            )}

            {/* 시그널 카드 (B 단지 비교 시) */}
            {result.complexB && (() => {
              const sc = signalConfig[result.signal];
              const Icon = sc.icon;
              return (
                <div style={{ padding: '20px', borderRadius: '14px', backgroundColor: sc.bg, border: `1px solid ${sc.color}30`, display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: `${sc.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={24} style={{ color: sc.color }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '20px', fontWeight: 800, color: sc.color }}>{sc.label}</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      현재 갭 {(result.currentGap / 10000).toFixed(1)}억 · 역사 평균 {(result.historicalAvgGap / 10000).toFixed(1)}억 · 마진 {(result.margin / 10000).toFixed(1)}억 (Z={result.zScore})
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* 데이터 경고 */}
            {result.dataWarning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', borderRadius: '10px', backgroundColor: 'var(--warning-bg, #FFF3D6)', fontSize: '13px', color: 'var(--warning-text, #8B6914)' }}>
                <AlertTriangle size={16} />
                {result.dataWarning}
              </div>
            )}

            {/* 차트 */}
            <div style={{ padding: '20px', borderRadius: '14px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <GapChart result={result} />
            </div>

            {/* 면책 고지 */}
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center', lineHeight: '1.6' }}>
              본 분석은 과거 실거래가 데이터에 기반한 참고 자료이며, 투자 판단의 근거로 사용할 수 없습니다.<br />
              실제 투자 결정은 전문가에 상담하시기 바랍니다.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function GapAnalysisPage() {
  return (
    <>
      <Header />
      <Suspense fallback={<div style={{ paddingTop: '64px', textAlign: 'center', color: 'var(--text-dim)', padding: '60px' }}>로딩 중...</div>}>
        <GapContent />
      </Suspense>
    </>
  );
}
