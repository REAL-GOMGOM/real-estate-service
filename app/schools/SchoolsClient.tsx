'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import sggCodesJson from '@/data/sido-sgg-codes.json';
import CoupangBanner from '@/components/ads/CoupangBanner';

/**
 * 학교 랭킹 리스트 (2026-07) — 집피드식 심플 리스트 UX.
 *
 * 시도·시군구 선택 → 초/중/고 탭 → 정렬(전입초과·학생수·학급당) → 카드 리스트.
 * 진학률 등급 정렬은 KESS/경기 진로 데이터 합류 시 기본 정렬로 승격 예정.
 * 데이터: /api/map/schools (학교알리미 공시 정적 JSON, 연 1회 갱신)
 */

interface SggEntry { sido: string; sidoCode: string; sgg: string; sggCode: string }

interface School {
  id: string;
  name: string;
  school_level: 'elementary' | 'middle' | 'high';
  address: string;
  establish_type: string | null;
  student_count: number | null;
  district: string;
  sido: string;
  class_count: number | null;
  per_class: number | null;
  move_in: number | null;
  move_out: number | null;
  hs_type: string | null;
}

type Level = 'elementary' | 'middle' | 'high';
type SortKey = 'netMoveIn' | 'students' | 'perClass';

const LEVEL_TABS: { key: Level; label: string }[] = [
  { key: 'elementary', label: '초등학교' },
  { key: 'middle', label: '중학교' },
  { key: 'high', label: '고등학교' },
];

const SORT_TABS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'netMoveIn', label: '전입초과순', hint: '전입-전출 (수요 유입 지표)' },
  { key: 'students', label: '학생수순', hint: '재학생 규모' },
  { key: 'perClass', label: '학급당순', hint: '학급당 학생수 (과밀도)' },
];

const SGG_CODES = sggCodesJson as SggEntry[];
const SIDO_LIST = [...new Set(SGG_CODES.map((e) => e.sido))];

const DEFAULT_SIDO = '서울특별시';
const DEFAULT_SGG = '강남구';

const netMoveIn = (s: School) =>
  s.move_in !== null && s.move_out !== null ? s.move_in - s.move_out : null;

/** "서울특별시 중구 다산로 269 (신당동,광희초등학교)" → 신당동 */
function dongFromAddress(address: string): string | null {
  const m = address.match(/\(([^),]+)/);
  return m ? m[1].trim() : null;
}

function rankBadge(rank: number): { bg: string; color: string } {
  if (rank === 1) return { bg: '#EBC15C33', color: '#B8860B' };
  if (rank === 2) return { bg: '#C0C0C033', color: '#7A7A85' };
  if (rank === 3) return { bg: '#CD7F3233', color: '#A05A2C' };
  return { bg: 'var(--border-light)', color: 'var(--text-dim)' };
}

export default function SchoolsClient() {
  const [sido, setSido] = useState(DEFAULT_SIDO);
  const [sgg, setSgg] = useState(DEFAULT_SGG);
  const [level, setLevel] = useState<Level>('middle');
  const [sortKey, setSortKey] = useState<SortKey>('netMoveIn');
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const sggOptions = useMemo(
    () => SGG_CODES.filter((e) => e.sido === sido).map((e) => e.sgg),
    [sido],
  );

  useEffect(() => {
    let aborted = false;
    const params = new URLSearchParams({ sido, level, limit: '3000' });
    // 세종처럼 시도=시군구 단일 지역은 시군구 필터 생략
    if (sgg && sgg !== sido) params.set('district', sgg);
    fetch(`/api/map/schools?${params}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !Array.isArray(json.schools)) {
          throw new Error(json.error || `학교 API HTTP ${response.status}`);
        }
        return json.schools as School[];
      })
      .then((items) => { if (!aborted) setSchools(items); })
      .catch(() => {
        if (!aborted) {
          setSchools([]);
          setError(true);
        }
      })
      .finally(() => { if (!aborted) setLoading(false); });
    return () => { aborted = true; };
  }, [sido, sgg, level, retryKey]);

  const sorted = useMemo(() => {
    const val = (s: School): number => {
      if (sortKey === 'netMoveIn') return netMoveIn(s) ?? -Infinity;
      if (sortKey === 'students') return s.student_count ?? -Infinity;
      return s.per_class ?? -Infinity;
    };
    return [...schools].sort((a, b) => val(b) - val(a));
  }, [schools, sortKey]);

  const selectStyle: React.CSSProperties = {
    padding: '10px 12px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
    backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
    border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
  };

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '32px 24px 56px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
        학교 랭킹
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
        전국 11,973개교 · 학생수/학급당/전출입 공시 기준 · 특목·자사고 진학률 등급은 연동 준비 중
      </p>

      {/* 지역 선택 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <select
          value={sido}
          onChange={(e) => {
            const next = e.target.value;
            setLoading(true);
            setError(false);
            setSido(next);
            const firstSgg = SGG_CODES.find((c) => c.sido === next)?.sgg ?? '';
            setSgg(firstSgg);
          }}
          style={selectStyle}
          aria-label="시도 선택"
        >
          {SIDO_LIST.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sgg} onChange={(e) => { setLoading(true); setError(false); setSgg(e.target.value); }} style={selectStyle} aria-label="시군구 선택">
          {sggOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* 학교급 탭 */}
      <div role="group" aria-label="학교급" style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        {LEVEL_TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => { setLoading(true); setError(false); setLevel(t.key); }}
            aria-pressed={level === t.key}
            style={{
              padding: '9px 16px', borderRadius: '10px', fontSize: '13.5px', fontWeight: 700,
              backgroundColor: level === t.key ? 'var(--accent)' : 'var(--bg-card)',
              color: level === t.key ? '#FFFFFF' : 'var(--text-muted)',
              border: level === t.key ? 'none' : '1px solid var(--border)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 정렬 탭 */}
      <div role="group" aria-label="학교 정렬 기준" style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {SORT_TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => setSortKey(t.key)}
            aria-pressed={sortKey === t.key}
            title={t.hint}
            style={{
              padding: '6px 12px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 600,
              backgroundColor: sortKey === t.key ? 'rgba(27,77,219,0.10)' : 'transparent',
              color: sortKey === t.key ? 'var(--accent)' : 'var(--text-dim)',
              border: `1px solid ${sortKey === t.key ? 'var(--accent)' : 'var(--border-light)'}`,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 리스트 */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} aria-hidden>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: '74px', borderRadius: '14px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)' }} />
          ))}
        </div>
      ) : error ? (
        <div role="alert" style={{ fontSize: '14px', color: 'var(--text-dim)', textAlign: 'center', padding: '40px 0' }}>
          <p style={{ margin: 0 }}>학교 공시 데이터를 잠시 불러오지 못했습니다.</p>
          <button
            type="button"
            onClick={() => { setLoading(true); setError(false); setRetryKey((key) => key + 1); }}
            style={{ marginTop: '12px', padding: '8px 14px', borderRadius: '8px', border: 0, background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
          >
            다시 시도
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'var(--text-dim)', textAlign: 'center', padding: '48px 0' }}>
          이 지역에 해당 학교급 데이터가 없습니다.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sorted.map((s, i) => {
            const rank = i + 1;
            const badge = rankBadge(rank);
            const net = netMoveIn(s);
            const dong = dongFromAddress(s.address);
            return (
              <Fragment key={s.id}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '14px 16px', borderRadius: '14px',
                  backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
                }}
              >
                <span style={{
                  minWidth: '34px', height: '34px', borderRadius: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace',
                  backgroundColor: badge.bg, color: badge.color,
                }}>
                  {rank}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {s.name}
                    </span>
                    {s.hs_type && s.hs_type !== '일반고등학교' && (
                      <span style={{
                        fontSize: '10.5px', fontWeight: 700, padding: '1px 7px', borderRadius: '5px',
                        backgroundColor: '#EBC15C22', color: '#B8860B',
                      }}>
                        {s.hs_type.replace('고등학교', '고')}
                      </span>
                    )}
                    {s.establish_type === '사립' && (
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>사립</span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: '3px 0 0' }}>
                    {dong ?? s.district}
                    {s.student_count != null && ` · ${s.student_count.toLocaleString()}명`}
                    {s.per_class != null && ` · 학급당 ${s.per_class}명`}
                  </p>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {net !== null ? (
                    <>
                      <p style={{
                        fontSize: '15px', fontWeight: 800, margin: 0,
                        fontFamily: 'Roboto Mono, monospace',
                        color: net > 0 ? 'var(--up-color, #C92F2F)' : net < 0 ? '#1636A8' : 'var(--text-dim)',
                      }}>
                        {net > 0 ? `+${net}` : net}
                      </p>
                      <p style={{ fontSize: '10.5px', color: 'var(--text-dim)', margin: '2px 0 0' }}>연간 전입초과</p>
                    </>
                  ) : (
                    <p style={{ fontSize: '12px', color: 'var(--text-dim)', margin: 0 }}>—</p>
                  )}
                </div>
              </div>
              {/* 인피드 광고 — 10위 카드 뒤 1개 */}
              {rank === 10 && <CoupangBanner variant="inline" subId="schools-feed" />}
              </Fragment>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: '24px 0 0', lineHeight: 1.8 }}>
        ※ 출처: 학교알리미(초·중등 교육정보 공시서비스) 2026년 공시 · 연 1회 갱신.
        전입초과는 연간 전입-전출 학생수로 학군 수요 참고 지표이며, 특목·자사고/대학 진학률 등급은 데이터 연동 후 제공됩니다.
      </p>
    </div>
  );
}
