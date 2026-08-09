'use client';

import { useEffect, useState } from 'react';

/**
 * 랜딩 84㎡ 실거래 평균.
 * 전용 API가 6개 구를 한 번의 SQL로 집계하며, 클라이언트는 실제 응답만 표시한다.
 */

const BLUE = '#1B4DDB';
const INK = '#0B1524';
const INK2 = '#2B333F';
const MUTED = '#8A93A3';
const BORDER = '#E7EAF0';
const EXPECTED_REGION_COUNT = 6;

interface Row {
  region:          string;
  recentAverage:   number | null;
  recentCount:     number;
  previousAverage: number | null;
  previousCount:   number;
  changePct:       number | null;
}

interface MarketLiveResponse {
  status?: 'ok' | 'degraded';
  rows?: Row[];
  aggregation?: {
    label?: string;
  };
  note?: string;
}

type MarketView =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: Row[]; partial: boolean; aggregationLabel: string }
  | { kind: 'empty'; rows: Row[]; aggregationLabel: string }
  | { kind: 'degraded'; message: string };

const DEFAULT_AGGREGATION_LABEL = '거래 1건당 동일 가중치의 단순 산술평균';

function fmtEok(manwon: number): string {
  if (manwon >= 10000) {
    const e = Math.round((manwon / 10000) * 10) / 10;
    return (Number.isInteger(e) ? String(e) : e.toFixed(1)) + '억';
  }
  return manwon.toLocaleString() + '만';
}

export default function MarketLive() {
  const [view, setView] = useState<MarketView>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/transactions/market-live')
      .then(async (res) => {
        if (!res.ok) throw new Error(`market-live HTTP ${res.status}`);
        return res.json() as Promise<MarketLiveResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        if (json.status !== 'ok' || !Array.isArray(json.rows)) {
          setView({
            kind: 'degraded',
            message: json.note ?? '84㎡ 실거래 평균을 잠시 불러오지 못했습니다.',
          });
          return;
        }

        const aggregationLabel = json.aggregation?.label ?? DEFAULT_AGGREGATION_LABEL;
        const rowsWithRecentDeals = json.rows.filter((row) => row.recentCount > 0);
        if (rowsWithRecentDeals.length === 0) {
          setView({ kind: 'empty', rows: json.rows, aggregationLabel });
          return;
        }

        setView({
          kind: 'ready',
          rows: json.rows,
          partial: rowsWithRecentDeals.length < EXPECTED_REGION_COUNT,
          aggregationLabel,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setView({ kind: 'degraded', message: '84㎡ 실거래 평균을 잠시 불러오지 못했습니다.' });
        }
      });

    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <div style={{
      background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 18,
      padding: 20, minWidth: 0, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: INK, letterSpacing: '-0.01em' }}>수도권 84㎡ 실거래 평균</span>
        <span style={{ fontSize: 11, color: MUTED }}>최근 30일 · 직전 30일 대비</span>
      </div>

      {view.kind === 'loading' && (
        <div role="status" style={{ color: MUTED, fontSize: 13, padding: '28px 0' }}>
          84㎡ 실거래 평균을 불러오는 중입니다.
        </div>
      )}

      {view.kind === 'empty' && (
        <div role="status" style={{ color: MUTED, fontSize: 13, padding: '12px 0 5px', lineHeight: 1.5 }}>
          선택 지역의 최근 30일 84㎡ 매매 실거래가 없습니다.
        </div>
      )}

      {view.kind === 'degraded' && (
        <div role="alert" style={{ color: MUTED, fontSize: 13, padding: '18px 0', lineHeight: 1.5 }}>
          <div>{view.message}</div>
          <button
            type="button"
            onClick={() => {
              setView({ kind: 'loading' });
              setAttempt((n) => n + 1);
            }}
            style={{
              marginTop: 10, border: '1px solid #D9DEEA', borderRadius: 8, background: '#FFFFFF',
              color: BLUE, fontWeight: 700, fontSize: 12, padding: '6px 10px', cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      )}

      {(view.kind === 'ready' || view.kind === 'empty') && (
        <>
          {view.rows.map((row) => {
            const up = row.changePct !== null && row.changePct > 0;
            const unchanged = row.changePct === 0;
            return (
              <div key={row.region} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '9px 0', borderBottom: '1px solid #F1F3F7',
              }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: INK2 }}>{row.region}</span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: INK, fontFamily: 'Roboto Mono, monospace' }}>
                      {row.recentAverage === null ? '최근 거래 없음' : fmtEok(row.recentAverage)}
                    </span>
                    {row.changePct !== null && (
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: unchanged ? MUTED : (up ? '#E5484D' : BLUE),
                        fontFamily: 'Roboto Mono, monospace', minWidth: 56, textAlign: 'right',
                      }}>
                        {unchanged ? '— 0%' : `${up ? '▲ +' : '▼ '}${row.changePct}%`}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 10.5, color: MUTED }}>
                    최근 {row.recentCount}건 · 직전 {row.previousCount}건
                    {row.previousCount === 0 ? ' · 비교 불가' : ''}
                  </span>
                </span>
              </div>
            );
          })}
          {view.kind === 'ready' && view.partial && (
            <div role="status" style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>
              일부 지역은 최근 30일 표본이 없어 평균을 표시하지 않습니다.
            </div>
          )}
        </>
      )}

      {(view.kind === 'ready' || view.kind === 'empty') && (
        <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.45, marginTop: 10 }}>
          아파트 매매 · 전용 80~88㎡ · 취소 제외<br />
          {view.aggregationLabel}
        </div>
      )}
    </div>
  );
}
