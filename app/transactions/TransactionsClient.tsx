'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import ErrorState from '@/components/common/ErrorState';
import { findDistrictByLawdCd } from '@/lib/district-codes';
import { DISTRICT_GROUPS } from '@/lib/district-groups';
import { matchesQuery } from '@/lib/search-utils';
import Header from '@/components/layout/Header';
import { AptAutocomplete, type ApartmentSearchResult } from '@/components/search/AptAutocomplete';
import { type AptGroup, type DistrictStat, detectNewHigh } from './types';
import AptCard from './components/AptCard';
import AptDetailModal from './components/AptDetailModal';
import RegionPickerModal from './components/RegionPickerModal';
import DistrictChips from './components/DistrictChips';

/**
 * 실거래 조회 클라이언트 — 사이클 W (아실형 개편)
 *
 * summary(시도 카드) → 구 선택 모달 → detail(구 칩 + 아실형 단지 카드).
 * 정렬(거래량·최신·가격) + 신고가만 + 면적 필터.
 */

function findGroupIndexOfDistrict(district: string): number {
  return DISTRICT_GROUPS.findIndex((g) => g.districts.includes(district));
}

function todayLabel(d: Date) {
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}.${d.getDate()}(${day})`;
}

type SortKey = 'volume' | 'date' | 'price';

interface SummaryRegion {
  label:          string;
  estimatedCount: number;
  newHighs:       number;
  avg59:          number | null;
  avg84:          number | null;
  firstDistrict:  string;
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'volume', label: '거래많은순' },
  { key: 'date',   label: '최신순' },
  { key: 'price',  label: '높은가격순' },
];

const AREA_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: '전체 면적' },
  { key: '59',  label: '59㎡' },
  { key: '84',  label: '84㎡' },
];

export default function TransactionsClient() {
  const searchParams  = useSearchParams();
  const districtParam = searchParams.get('district');
  const queryParam    = searchParams.get('q');

  const [today, setToday] = useState(new Date(0));
  useEffect(() => { setToday(new Date()); }, []);

  const [district,  setDistrict]  = useState(districtParam || '강남구');
  const [groupIdx,  setGroupIdx]  = useState(() => Math.max(0, findGroupIndexOfDistrict(districtParam || '강남구')));
  const [months,    setMonths]    = useState(6);
  const [query,     setQuery]     = useState(queryParam ?? '');
  const [groups,    setGroups]    = useState<AptGroup[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [fetched,   setFetched]   = useState('');
  const [activeApt, setActiveApt] = useState<AptGroup | null>(null);

  const [viewMode, setViewMode] = useState<'summary' | 'detail'>(districtParam ? 'detail' : 'summary');
  const [summaryData, setSummaryData] = useState<SummaryRegion[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // 구 선택 모달 (아실형) — 열려 있으면 해당 시도 그룹
  const [picker, setPicker] = useState<{ label: string; districts: string[] } | null>(null);

  // 구별 칩 통계 — 그룹 단위 캐시
  const [districtStats, setDistrictStats] = useState<Record<string, DistrictStat[]>>({});

  // 정렬·필터
  const [sortKey,     setSortKey]     = useState<SortKey>('volume');
  const [newHighOnly, setNewHighOnly] = useState(false);
  const [areaFilter,  setAreaFilter]  = useState('all');

  // 딥링크 — district(+q) 로 바로 detail 진입
  useEffect(() => {
    if (districtParam) {
      setDistrict(districtParam);
      setGroupIdx(Math.max(0, findGroupIndexOfDistrict(districtParam)));
      if (queryParam) setQuery(queryParam);
      setViewMode('detail');
      setFetched('');
    }
  }, [districtParam, queryParam]);

  const load = useCallback(async (d: string, m: number) => {
    const key = `${d}-${m}`;
    if (fetched === key) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/transactions?district=${encodeURIComponent(d)}&months=${m}`);
      const json = await res.json();
      setGroups(json.data ?? []);
      setFetched(key);
    } catch {
      setGroups([]);
      setError('데이터 조회에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [fetched]);

  useEffect(() => {
    if (viewMode === 'detail') load(district, months);
  }, [district, months, viewMode, load]);

  // 시도별 요약
  useEffect(() => {
    if (viewMode !== 'summary') return;
    setSummaryLoading(true);
    fetch('/api/transactions/summary')
      .then(r => r.json())
      .then(json => {
        setSummaryData(json.summary || []);
        setSummaryLoading(false);
      })
      .catch(() => setSummaryLoading(false));
  }, [viewMode]);

  // 구별 칩 통계 — detail 진입 시 그룹 단위로 1회 조회
  const groupLabel = DISTRICT_GROUPS[groupIdx]?.label ?? '';
  useEffect(() => {
    if (viewMode !== 'detail' || !groupLabel || districtStats[groupLabel]) return;
    fetch(`/api/transactions/districts?group=${encodeURIComponent(groupLabel)}`)
      .then(r => r.json())
      .then(json => {
        if (Array.isArray(json.districts)) {
          setDistrictStats(prev => ({ ...prev, [groupLabel]: json.districts }));
        }
      })
      .catch(() => { /* 칩은 구명만으로 폴백 렌더 */ });
  }, [viewMode, groupLabel, districtStats]);

  // 검색·필터·정렬 파이프라인
  const filtered = useMemo(() => {
    let list = query.trim() ? groups.filter((g) => matchesQuery(g.name, query.trim())) : groups;

    if (newHighOnly) list = list.filter(detectNewHigh);

    if (areaFilter !== 'all') {
      const target = parseInt(areaFilter);
      list = list.filter((g) => g.areas.some((a) => Math.abs(a - target) <= 4));
    }

    const latestOf = (g: AptGroup) =>
      g.transactions.reduce((m, t) => (t.date > m ? t.date : m), '');
    const latestPriceOf = (g: AptGroup) => {
      const sorted = [...g.transactions].sort((a, b) => b.date.localeCompare(a.date));
      return sorted[0]?.price ?? 0;
    };

    return [...list].sort((a, b) => {
      if (sortKey === 'date')  return latestOf(b).localeCompare(latestOf(a));
      if (sortKey === 'price') return latestPriceOf(b) - latestPriceOf(a);
      return b.transactions.length - a.transactions.length;
    });
  }, [groups, query, newHighOnly, areaFilter, sortKey]);

  const totalTx    = filtered.reduce((s, g) => s + g.transactions.length, 0);
  const newHighCnt = filtered.filter(detectNewHigh).length;

  const enterDistrict = (d: string) => {
    setGroupIdx(Math.max(0, findGroupIndexOfDistrict(d)));
    setDistrict(d);
    setViewMode('detail');
    setFetched('');
    setPicker(null);
  };

  return (
    <>
    <Header />
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px' }}>

        {/* 헤더 */}
        <div style={{ marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 800, color: 'var(--text-primary)' }}>
              최신 실거래
            </h1>
            <span style={{
              padding: '4px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
            }}>
              {today.getFullYear() > 2000 ? todayLabel(today) : '—'}
            </span>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>국토교통부 실거래가 공개시스템 데이터를 기반으로 전국 아파트 매매 거래를 조회합니다.</p>
          <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>출처: 국토교통부</p>
        </div>

        {/* 시도별 요약 카드 뷰 */}
        {viewMode === 'summary' && (
          <>
            {summaryLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', marginTop: '20px' }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} style={{
                    height: '150px', borderRadius: '16px',
                    backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }} />
                ))}
                <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.6}}`}</style>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', marginTop: '20px' }}>
                {summaryData.map((region) => (
                  <button
                    key={region.label}
                    onClick={() => {
                      // 아실형 — 카드 클릭 시 구 선택 모달
                      const group = DISTRICT_GROUPS.find((g) => g.label === region.label);
                      if (group) setPicker({ label: group.label, districts: group.districts });
                    }}
                    style={{
                      padding: '20px', borderRadius: '16px',
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(20,33,61,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {region.label}
                      </span>
                      <span style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace', color: 'var(--text-primary)' }}>
                        {region.estimatedCount.toLocaleString()}건
                      </span>
                    </div>

                    {region.newHighs > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                          신고가{' '}
                          <strong style={{ color: 'var(--up-color, #C92F2F)' }}>{region.newHighs}</strong>건
                        </span>
                      </div>
                    )}

                    <div style={{
                      display: 'flex', gap: '14px',
                      paddingTop: '12px', borderTop: '1px solid var(--border-light)',
                    }}>
                      {region.avg59 && (
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                          59㎡{' '}
                          <strong style={{ color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>
                            {region.avg59 >= 10000 ? `${(region.avg59 / 10000).toFixed(1)}억` : `${region.avg59.toLocaleString()}만`}
                          </strong>
                        </span>
                      )}
                      {region.avg84 && (
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                          84㎡{' '}
                          <strong style={{ color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>
                            {region.avg84 >= 10000 ? `${(region.avg84 / 10000).toFixed(1)}억` : `${region.avg84.toLocaleString()}만`}
                          </strong>
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <p style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-dim)' }}>
              ※ 대표 구 기준 추정치입니다. 지역을 클릭해 구를 선택하면 상세 거래를 확인할 수 있습니다.
            </p>
          </>
        )}

        {/* detail 뷰 */}
        {viewMode === 'detail' && (
          <>
        <button
          onClick={() => setViewMode('summary')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '13px', fontWeight: 600, color: 'var(--accent)',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 0', marginBottom: '12px',
          }}
        >
          ← 전체 보기
        </button>

        {/* 매매 탭 */}
        <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '20px', display: 'flex' }}>
          <button style={{
            padding: '12px 4px', marginRight: '24px', fontSize: '15px', fontWeight: 700,
            color: 'var(--text-primary)', background: 'none', border: 'none', cursor: 'default',
            borderBottom: '2px solid var(--accent)', marginBottom: '-1px',
          }}>
            매매
          </button>
        </div>

        {/* 구별 칩 (아실형 — 건수·신고가) */}
        <DistrictChips
          districts={DISTRICT_GROUPS[groupIdx]?.districts ?? []}
          stats={districtStats[groupLabel] ?? null}
          active={district}
          onPick={(d) => { setDistrict(d); setFetched(''); }}
        />

        {/* 통계 바 + 정렬·필터 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px', flexWrap: 'wrap', marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {!loading && filtered.length > 0 && (
              <>
                <span style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
                  총&nbsp;<strong style={{ color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{totalTx.toLocaleString()}</strong>건
                </span>
                {newHighCnt > 0 && (
                  <span style={{ fontSize: '14px', color: 'var(--text-dim)' }}>
                    신고가&nbsp;<strong style={{ color: 'var(--up-color, #C92F2F)' }}>{newHighCnt}</strong>건
                  </span>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              aria-label="면적 필터"
              style={{
                padding: '8px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', cursor: 'pointer', outline: 'none',
              }}
            >
              {AREA_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="정렬"
              style={{
                padding: '8px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                backgroundColor: 'var(--ink, #14213D)', color: '#FFFFFF',
                border: '1px solid var(--ink, #14213D)', cursor: 'pointer', outline: 'none',
              }}
            >
              {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setNewHighOnly((v) => !v)}
              aria-pressed={newHighOnly}
              style={{
                padding: '8px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                backgroundColor: newHighOnly ? 'var(--up-color, #C92F2F)' : 'var(--bg-card)',
                color: newHighOnly ? '#FFFFFF' : 'var(--text-muted)',
                border: `1px solid ${newHighOnly ? 'var(--up-color, #C92F2F)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              신고가
            </button>
          </div>
        </div>

        {/* 기간 필터 + 검색 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', flexWrap: 'wrap', alignItems: 'center' }}>
          {([
            { label: '3개월',  value: 3  },
            { label: '6개월',  value: 6  },
            { label: '1년',    value: 12 },
            { label: '2년',    value: 24 },
            { label: '3년',    value: 36 },
          ] as { label: string; value: number }[]).map(({ label, value }) => (
            <button
              key={value}
              onClick={() => { setMonths(value); setFetched(''); }}
              style={{
                padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                backgroundColor: months === value ? 'var(--accent)' : 'var(--bg-card)',
                color:           months === value ? '#FFFFFF'       : 'var(--text-dim)',
                border: `1px solid ${months === value ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}

          <div style={{ flex: 1, minWidth: '220px' }}>
            <AptAutocomplete
              placeholder="단지명 입력 (예: 잠실엘스)"
              onSelect={(apt: ApartmentSearchResult) => {
                const districtLabel = findDistrictByLawdCd(apt.lawdCd) ?? apt.sigungu;
                const matched = findGroupIndexOfDistrict(districtLabel);
                if (matched >= 0) setGroupIdx(matched);
                setDistrict(districtLabel);
                setQuery(apt.name);
                setFetched('');
              }}
            />
          </div>
        </div>

        {/* 에러 상태 */}
        {error && !loading && (
          <ErrorState
            message="실거래 데이터를 불러오지 못했습니다"
            detail={error}
            onRetry={() => { setError(null); setFetched(''); load(district, months); }}
          />
        )}

        {/* 카드 그리드 */}
        {loading ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{
                  height: '220px', borderRadius: '16px',
                  backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              ))}
            </div>
            <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.6}}`}</style>
          </>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '14px' }}>
            {query ? `"${query}" 검색 결과 없음` : '조건에 맞는 거래 없음'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
            {filtered.map((apt) => (
              <AptCard key={apt.id} apt={apt} onClick={() => setActiveApt(apt)} />
            ))}
          </div>
        )}

        <p style={{ marginTop: '24px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.8 }}>
          ※ 매매 계약일 기준 · 신고가는 조회 기간 내 동일 면적 최고가 기준 · 전고점은 조회 기간 내 대표 면적 최고가
        </p>
          </>
        )}
      </div>

      {/* 구 선택 모달 */}
      {picker && (
        <RegionPickerModal
          label={picker.label}
          districts={picker.districts}
          onPick={enterDistrict}
          onClose={() => setPicker(null)}
        />
      )}

      {/* 단지 상세 모달 */}
      {activeApt && (
        <AptDetailModal
          apt={activeApt}
          onClose={() => setActiveApt(null)}
          months={months}
        />
      )}
    </main>
    </>
  );
}
