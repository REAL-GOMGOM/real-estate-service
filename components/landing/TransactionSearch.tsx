'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';

const REGIONS: { label: string; districts: string[] }[] = [
  {
    label: '서울',
    districts: [
      '강남구', '서초구', '송파구', '용산구', '마포구', '성동구',
      '영등포구', '양천구', '강동구', '광진구', '동작구', '관악구',
      '강서구', '구로구', '노원구', '도봉구', '동대문구', '서대문구',
      '성북구', '은평구', '종로구', '중구', '중랑구', '강북구', '금천구',
    ],
  },
  {
    label: '경기',
    districts: [
      '성남시 분당구', '과천시', '하남시', '수원시 영통구', '수원시 팔달구',
      '용인시 수지구', '용인시 기흥구', '용인시 처인구',
      '고양시 일산동구', '고양시 일산서구', '고양시 덕양구',
      '안양시 동안구', '안양시 만안구', '광명시', '의왕시', '부천시',
      '구리시', '남양주시', '의정부시', '시흥시', '김포시', '화성시',
      '평택시', '파주시', '군포시', '양주시', '광주시', '이천시',
    ],
  },
  {
    label: '인천',
    districts: [
      '인천 연수구', '인천 서구', '인천 부평구', '인천 남동구',
      '인천 계양구', '인천 미추홀구', '인천 동구', '인천 중구',
    ],
  },
  {
    label: '부산',
    districts: [
      '부산 해운대구', '부산 수영구', '부산 동래구', '부산 연제구',
      '부산 남구', '부산 부산진구', '부산 동구', '부산 중구',
      '부산 서구', '부산 북구', '부산 금정구', '부산 사하구',
    ],
  },
  {
    label: '대구/울산',
    districts: [
      '대구 수성구', '대구 달서구', '대구 북구', '대구 동구', '대구 중구',
      '울산 남구', '울산 동구', '울산 북구', '울산 중구',
    ],
  },
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
  const [regionIdx, setRegionIdx] = useState(0);
  const [district, setDistrict]   = useState('강남구');
  const [aptQuery, setAptQuery]   = useState('');
  const [apts, setApts]           = useState<AptSummary[]>([]);
  const [loading, setLoading]     = useState(false);
  const [fetched, setFetched]     = useState<string | null>(null);

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
          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '8px' }}>
            실거래가 조회
          </p>
          <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            최근 3개월 실거래 현황
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            국토교통부 실거래가 공개시스템 기반 · 구 단위로 단지를 검색하세요
          </p>
        </div>

        {/* 권역 탭 */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {REGIONS.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => { setRegionIdx(i); setDistrict(REGIONS[i].districts[0]); }}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', border: 'none',
                backgroundColor: regionIdx === i ? 'var(--accent)' : 'var(--border-light)',
                color: regionIdx === i ? '#fff' : 'var(--text-dim)',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* 구 선택 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
          {REGIONS[regionIdx].districts.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDistrict(d)}
              style={{
                padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
                cursor: 'pointer',
                border: district === d ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                backgroundColor: district === d ? 'rgba(59,130,246,0.15)' : 'var(--border-light)',
                color: district === d ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {d.replace(/^(인천|부산|대구|울산)\s/, '')}
            </button>
          ))}
        </div>

        {/* 검색 폼 */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '28px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }}
            />
            <input
              type="text"
              placeholder="단지명 입력 (예: 래미안)"
              value={aptQuery}
              onChange={(e) => setAptQuery(e.target.value)}
              style={{
                width: '100%', padding: '12px 16px 12px 40px', borderRadius: '12px',
                fontSize: '14px', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
              backgroundColor: 'var(--accent)', color: 'white', border: 'none', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            차트에서 보기
          </button>
        </form>

        {/* 결과 목록 */}
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '14px' }}>
            데이터 불러오는 중...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '14px' }}>
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
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-border)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>{apt.name}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{apt.district} · {apt.txCount}건</p>
                    </div>
                    <ExternalLink size={13} color="#334155" style={{ flexShrink: 0, marginTop: '2px' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>최근 거래가</p>
                      <p style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>
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
                  <p style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '6px' }}>{apt.latestDate} 기준</p>
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
              backgroundColor: 'transparent', color: 'var(--text-dim)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
          >
            {district} 전체 차트 보기 →
          </button>
        </div>
      </div>
    </section>
  );
}
