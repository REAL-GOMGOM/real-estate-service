'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';

// 서울 주요 구 목록 (홈 미리보기용)
const SEOUL_DISTRICTS = [
  '강남구', '서초구', '송파구', '마포구', '용산구',
  '성동구', '영등포구', '양천구', '강동구', '강서구',
  '광진구', '동작구', '관악구', '노원구', '도봉구',
  '서대문구', '성북구', '은평구', '종로구', '중구',
];

interface AptSummary {
  id:          string;
  name:        string;
  district:    string;
  latestPrice: number;
  latestDate:  string;
  changeRate:  number;
  txCount:     number;
}

function fmt억(manwon: number) {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

export default function TransactionSearch() {
  const router = useRouter();
  const [district, setDistrict]   = useState('강남구');
  const [aptQuery, setAptQuery]   = useState('');
  const [apts, setApts]           = useState<AptSummary[]>([]);
  const [loading, setLoading]     = useState(false);
  const [fetched, setFetched]     = useState<string | null>(null); // 마지막으로 fetch한 구

  const loadDistrict = useCallback(async (d: string) => {
    if (fetched === d) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/transactions?district=${encodeURIComponent(d)}&months=3`);
      const json = await res.json();
      const data: any[] = json.data ?? [];

      const summaries: AptSummary[] = data.slice(0, 20).map((apt: any) => {
        const sorted = [...apt.transactions].sort((a: any, b: any) =>
          b.date.localeCompare(a.date),
        );
        const latest = sorted[0];
        const prev   = sorted[1] ?? sorted[0];
        const change = prev.price > 0 ? ((latest.price - prev.price) / prev.price) * 100 : 0;
        return {
          id:          apt.id,
          name:        apt.name,
          district:    apt.district,
          latestPrice: latest.price,
          latestDate:  latest.date,
          changeRate:  change,
          txCount:     apt.transactions.length,
        };
      });

      setApts(summaries);
      setFetched(d);
    } catch {
      setApts([]);
    } finally {
      setLoading(false);
    }
  }, [fetched]);

  useEffect(() => { loadDistrict(district); }, [district]);

  const filtered = aptQuery.trim()
    ? apts.filter((a) => a.name.includes(aptQuery.trim()))
    : apts.slice(0, 6);

  function goToChart(targetDistrict: string) {
    router.push(`/chart?district=${encodeURIComponent(targetDistrict)}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    goToChart(district);
  }

  return (
    <section style={{ padding: '80px 24px', backgroundColor: '#070B16' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>

        {/* 섹션 헤더 */}
        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#3B82F6', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            실거래가 조회
          </p>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: '#F1F5F9', marginBottom: '8px' }}>
            최근 3개월 실거래 현황
          </h2>
          <p style={{ fontSize: '14px', color: '#CBD5E1' }}>
            국토교통부 실거래가 공개시스템 기반 · 구 단위로 단지를 검색하세요
          </p>
        </div>

        {/* 검색 폼 */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '28px', flexWrap: 'wrap' }}>
          <select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            style={{
              padding: '12px 16px', borderRadius: '12px', fontSize: '14px', fontWeight: 500,
              backgroundColor: '#0F1629', color: '#F1F5F9',
              border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', outline: 'none',
            }}
          >
            {SEOUL_DISTRICTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#475569', pointerEvents: 'none' }}
            />
            <input
              type="text"
              placeholder="단지명 입력 (예: 래미안)"
              value={aptQuery}
              onChange={(e) => setAptQuery(e.target.value)}
              style={{
                width: '100%', padding: '12px 16px 12px 40px', borderRadius: '12px',
                fontSize: '14px', backgroundColor: '#0F1629', color: '#F1F5F9',
                border: '1px solid rgba(255,255,255,0.1)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
              backgroundColor: '#3B82F6', color: 'white', border: 'none', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            차트에서 보기
          </button>
        </form>

        {/* 결과 목록 */}
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>
            데이터 불러오는 중...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>
            {aptQuery ? `"${aptQuery}" 검색 결과 없음` : '거래 데이터 없음'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {filtered.map((apt) => {
              const up = apt.changeRate >= 0;
              return (
                <div
                  key={apt.id}
                  onClick={() => goToChart(apt.district)}
                  style={{
                    padding: '18px 20px', borderRadius: '14px', cursor: 'pointer',
                    backgroundColor: '#0F1629',
                    border: '1px solid rgba(255,255,255,0.07)',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '2px' }}>{apt.name}</p>
                      <p style={{ fontSize: '11px', color: '#94A3B8' }}>{apt.district} · {apt.txCount}건</p>
                    </div>
                    <ExternalLink size={13} color="#334155" style={{ flexShrink: 0, marginTop: '2px' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>최근 거래가</p>
                      <p style={{ fontSize: '17px', fontWeight: 700, color: '#F1F5F9', fontFamily: 'Roboto Mono, monospace' }}>
                        {fmt억(apt.latestPrice)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: up ? '#22C55E' : '#F87171' }}>
                      {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'Roboto Mono, monospace' }}>
                        {up ? '+' : ''}{apt.changeRate.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <p style={{ fontSize: '10px', color: '#64748B', marginTop: '6px' }}>{apt.latestDate} 기준</p>
                </div>
              );
            })}
          </div>
        )}

        {/* 전체 차트 보기 링크 */}
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button
            onClick={() => goToChart(district)}
            style={{
              padding: '10px 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 500,
              backgroundColor: 'transparent', color: '#64748B',
              border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
            }}
          >
            {district} 전체 차트 보기 →
          </button>
        </div>
      </div>
    </section>
  );
}
