'use client';

import { useState, useCallback, Suspense, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/layout/Header';
import Link from 'next/link';
import { Search, TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowRight } from 'lucide-react';
import type { GapResult, ComplexSearchResult } from '@/types/gap-analysis';

const GapChart = dynamic(() => import('@/components/gap-analysis/GapChart'), { ssr: false });

import { DISTRICT_GROUPS } from '@/lib/district-groups';

function ComplexSearchInput({
  label,
  district,
  onDistrictChange,
  onSelect,
  selected,
  selectedSize,
  onSizeChange,
}: {
  label: string;
  district: string;
  onDistrictChange: (d: string) => void;
  onSelect: (c: ComplexSearchResult | null) => void;
  selected: ComplexSearchResult | null;
  selectedSize: number | null;
  onSizeChange: (size: number | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ComplexSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => searchControllerRef.current?.abort(), []);

  const search = useCallback(async (q: string, d: string) => {
    searchControllerRef.current?.abort();
    if (q.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setLoading(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/gap-analysis/search?q=${encodeURIComponent(q)}&district=${encodeURIComponent(d)}`, {
        signal: controller.signal,
      });
      const json = await res.json();
      if (
        !res.ok
        || (json?.status !== 'ok' && json?.status !== 'partial')
        || !Array.isArray(json?.results)
      ) {
        throw new Error(typeof json?.error === 'string' ? json.error : '단지 검색 결과를 확인하지 못했습니다.');
      }
      setResults(json.results);
      if (json.status === 'partial') {
        setSearchError(typeof json.note === 'string' ? json.note : '일부 월에서만 검색했습니다.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setResults([]);
      setSearchError(error instanceof Error ? error.message : '단지 검색에 실패했습니다.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  return (
    <div style={{ padding: '16px', borderRadius: '14px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px' }}>{label}</p>

      {selected ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-strong)' }}>{selected.name}</p>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{selected.district} {selected.dong}</p>
            {selected.sizes.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '9px', fontSize: '12px', color: 'var(--text-muted)' }}>
                전용면적
                <select
                  aria-label={`${label} 전용면적`}
                  value={selectedSize ?? ''}
                  onChange={(event) => onSizeChange(Number(event.target.value))}
                  style={{ padding: '6px 8px', borderRadius: '7px', backgroundColor: 'var(--btn-bg)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  {selected.sizes.map((size) => <option key={size} value={size}>{size.toFixed(1)}㎡</option>)}
                </select>
              </label>
            )}
          </div>
          <button type="button" onClick={() => { onSelect(null); onSizeChange(null); setQuery(''); setResults([]); }}
            style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
            변경
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select value={district} onChange={(e) => onDistrictChange(e.target.value)}
              style={{ padding: '8px', borderRadius: '8px', fontSize: '13px', backgroundColor: 'var(--btn-bg)', color: 'var(--text-primary)', border: '1px solid var(--border)', outline: 'none' }}>
              {DISTRICT_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.districts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </optgroup>
              ))}
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
          {searchError && <p role="alert" style={{ fontSize: '12px', color: 'var(--danger-text, #C92F2F)' }}>{searchError}</p>}
          {results.length > 0 && (
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {results.map((r) => (
                <button key={r.id} type="button" onClick={() => { onSelect(r); onSizeChange(r.sizes[0] ?? null); }}
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
  const [sizeA, setSizeA] = useState<number | null>(null);
  const [sizeB, setSizeB] = useState<number | null>(null);
  const [result, setResult] = useState<GapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analyzeControllerRef = useRef<AbortController | null>(null);
  const analyzeSequenceRef = useRef(0);

  useEffect(() => () => analyzeControllerRef.current?.abort(), []);

  const analyze = async () => {
    if (!complexA) return;
    analyzeControllerRef.current?.abort();
    const controller = new AbortController();
    analyzeControllerRef.current = controller;
    const sequence = ++analyzeSequenceRef.current;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/gap-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          complexA: { district: districtA, name: complexA.name, dong: complexA.dong, size: sizeA ?? undefined },
          complexB: complexB
            ? { district: districtB, name: complexB.name, dong: complexB.dong, size: sizeB ?? undefined }
            : undefined,
          period: 12,
        }),
      });
      const json = await res.json();
      if (sequence !== analyzeSequenceRef.current) return;
      if (!res.ok) {
        throw new Error(typeof json?.error === 'string' ? json.error : `갭 분석 요청 실패 (HTTP ${res.status})`);
      }
      if (
        (json?.status !== 'ok' && json?.status !== 'partial')
        || !Array.isArray(json?.complexA?.prices)
        || !Array.isArray(json?.monthlyGap)
        || typeof json?.method !== 'string'
      ) {
        throw new Error('갭 분석 응답 형식을 확인하지 못했습니다.');
      }
      setResult(json as GapResult);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      if (sequence === analyzeSequenceRef.current) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      if (sequence === analyzeSequenceRef.current && !controller.signal.aborted) setLoading(false);
    }
  };

  const signalConfig = {
    below_baseline: { label: '과거 기준보다 낮음', color: 'var(--success-text, #2E7A4C)', bg: 'var(--success-bg, #E9F6EE)', icon: TrendingDown },
    above_baseline: { label: '과거 기준보다 높음', color: 'var(--danger-text, #C92F2F)', bg: 'var(--danger-bg, #FDECEC)', icon: TrendingUp },
    near_baseline: { label: '과거 기준 범위', color: 'var(--text-muted)', bg: 'var(--btn-bg)', icon: Minus },
    insufficient: { label: '판정 보류', color: 'var(--warning-text, #8A6A1F)', bg: 'var(--warning-bg, #FBF3DC)', icon: AlertTriangle },
  };

  return (
    <main style={{ paddingTop: '64px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '28px 20px' }}>
        <h1 style={{ fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '4px' }}>
          갭 분석
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            선택한 동·전용면적의 취소 제외 실거래 평균을 비교합니다. 출처: 국토교통부
          </p>
          <Link href="/gap-guide" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px', borderRadius: '12px',
            backgroundColor: 'var(--accent)', color: 'white',
            fontSize: '14px', fontWeight: 700, textDecoration: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}>
            📖 갭투자 가이드
            <ArrowRight size={16} />
          </Link>
        </div>

        {/* 단지 선택 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '16px', marginBottom: '20px' }}>
          <ComplexSearchInput
            label="기준 단지 (A)"
            district={districtA}
            onDistrictChange={(district) => { setDistrictA(district); setComplexA(null); setSizeA(null); setResult(null); }}
            onSelect={(complex) => { setComplexA(complex); setResult(null); }}
            selected={complexA}
            selectedSize={sizeA}
            onSizeChange={(size) => { setSizeA(size); setResult(null); }}
          />
          <ComplexSearchInput
            label="비교 단지 (B) — 선택"
            district={districtB}
            onDistrictChange={(district) => { setDistrictB(district); setComplexB(null); setSizeB(null); setResult(null); }}
            onSelect={(complex) => { setComplexB(complex); setResult(null); }}
            selected={complexB}
            selectedSize={sizeB}
            onSizeChange={(size) => { setSizeB(size); setResult(null); }}
          />
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
          <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: 'var(--danger-bg, #FDECEC)', color: 'var(--danger-text, #C92F2F)', fontSize: '14px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        {/* 결과 */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* 매매·전세 단순 갭 카드 */}
            {result.latestPrice != null && result.rentAvg != null && result.rentRatio != null && result.investmentGap != null && (
              <div style={{ padding: '24px', borderRadius: '14px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '16px' }}>
                  {result.complexA.name} 실거래 기준 단순 갭
                </h3>

                {/* 핵심 수치 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: '매매가', value: `${(result.latestPrice / 10000).toFixed(1)}억`, color: 'var(--text-strong)' },
                    { label: '전세가', value: `${(result.rentAvg / 10000).toFixed(1)}억`, color: 'var(--accent)' },
                    { label: '매매−전세 평균', value: `${(result.investmentGap / 10000).toFixed(1)}억`, color: '#A97912' },
                    { label: '전세가율', value: `${result.rentRatio}%`, color: 'var(--text-strong)' },
                  ].map((item) => (
                    <div key={item.label} style={{ padding: '14px', borderRadius: '12px', backgroundColor: 'var(--btn-bg)', textAlign: 'center' }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>{item.label}</p>
                      <p style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace', color: item.color }}>{item.value}</p>
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '10px' }}>
                  매매 {result.tradeCount}건 · 최근 전세 표본 {result.rentCount}건 · {result.complexA.dong || '선택 지역'} · {result.complexA.size?.toFixed(1) ?? '전체'}㎡
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: '5px 0 0', lineHeight: 1.55 }}>
                  세금·중개보수·대출비용·보증금 변동은 반영하지 않은 실거래 평균 차이이며 투자금이나 수익률을 뜻하지 않습니다.
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
                      최근 공통월 평균 차이 {(result.currentGap / 10000).toFixed(1)}억 · 이전 구간 평균 {(result.historicalAvgGap / 10000).toFixed(1)}억 · 차이 {(result.margin / 10000).toFixed(1)}억
                      {result.zScore === null ? '' : ` · 표준화값 ${result.zScore}`}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* 데이터 경고 */}
            {result.dataWarning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', borderRadius: '10px', backgroundColor: 'var(--warning-bg, #FBF3DC)', fontSize: '13px', color: 'var(--warning-text, #8A6A1F)' }}>
                <AlertTriangle size={16} />
                {result.dataWarning}
              </div>
            )}

            <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: 'var(--btn-bg)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.65 }}>
              <p style={{ margin: 0 }}>{result.method}</p>
              <p style={{ margin: '4px 0 0' }}>
                요청 {result.coverage.requestedMonths.length}개월 · 매매 원본 확인 {result.coverage.saleA.successfulMonths.length}개월 · 전세 원본 확인 {result.coverage.rentA.successfulMonths.length}개월
              </p>
            </div>

            {/* 차트 */}
            <div style={{ padding: '20px', borderRadius: '14px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <GapChart result={result} />
            </div>

            {/* 면책 고지 */}
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center', lineHeight: '1.6' }}>
              ※ 내집(My.ZIP)의 데이터는 참고용이며, 투자·매수 결정은 본인의 재무 상황을 고려하고 전문가와 상담한 후 신중히 판단하시기 바랍니다.
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
      <Suspense fallback={<div style={{ paddingTop: '64px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}><div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} /><p style={{ fontSize: '14px', color: 'var(--text-dim)', fontWeight: 500 }}>불러오는 중...</p><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div>}>
        <GapContent />
      </Suspense>
    </>
  );
}
