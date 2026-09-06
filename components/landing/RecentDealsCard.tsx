'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { buildTransactionShareUrl } from '@/lib/transaction-share-url';
import { txKey } from '@/lib/tx-share-text';
import { DEFAULT_HOME_DISTRICT, getHomeDistrictSnapshot, saveHomeDistrict, subscribeHomeDistrict } from '@/lib/home-district';
import HomeDistrictPicker from './HomeDistrictPicker';

/**
 * 최근 실거래 카드 — 홈 대시보드.
 *
 * /api/transactions의 실제 매매 응답만 표시하며 로딩·빈 결과·장애·부분 제공을 구분한다.
 */

const BLUE = '#1B4DDB';
const INK = '#0B1524';
// URL 조립용 기준점만 사용하며, 렌더링에는 같은 사이트의 경로·쿼리만 전달한다.
const LINK_BASE = 'https://relative.invalid';

interface Tx {
  name: string;
  dong: string;
  area: string;
  floor: string;
  price: string;
  date: string;
  rawDate: string;
  href: string;
}

const getServerDistrict = () => '';

type DealsView =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: Tx[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'degraded'; message: string; rows: Tx[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fmtEok(manwon: number): string {
  if (manwon >= 10000) {
    const e = Math.round((manwon / 10000) * 10) / 10;
    return (Number.isInteger(e) ? String(e) : e.toFixed(1)) + '억';
  }
  return manwon.toLocaleString() + '만';
}

function fmtDay(date: string): string {
  const parts = date.split('-');
  if (parts.length >= 3) return `${parts[1]}.${parts[2]}`;
  if (parts.length === 2) return `${parts[0].slice(-2)}.${parts[1]}`;
  return date;
}

function parseTransactions(data: unknown[], requestedRegion: string): { rows: Tx[]; invalidCount: number } {
  const parsed: Tx[] = [];
  let invalidCount = 0;

  for (const groupValue of data) {
    if (!isRecord(groupValue)
      || typeof groupValue.name !== 'string'
      || groupValue.name.trim() === ''
      || !Array.isArray(groupValue.transactions)) {
      invalidCount += 1;
      continue;
    }

    const groupName = groupValue.name.trim();
    const groupDong = typeof groupValue.dong === 'string' ? groupValue.dong.trim() : '';
    const district = getMessage(groupValue.district) ?? requestedRegion;
    // 화면용 group.id나 거래 행의 임의 식별자로 마스터 ID를 추정하지 않는다.
    const masterId = getMessage(groupValue.masterId);

    for (const transactionValue of groupValue.transactions) {
      if (!isRecord(transactionValue)) {
        invalidCount += 1;
        continue;
      }

      const { area, floor, price, date } = transactionValue;
      if (typeof area !== 'number'
        || !Number.isFinite(area)
        || area <= 0
        || typeof floor !== 'number'
        || !Number.isFinite(floor)
        || typeof price !== 'number'
        || !Number.isFinite(price)
        || price <= 0
        || typeof date !== 'string'
        || !/^\d{4}-\d{2}(?:-\d{2})?$/.test(date)) {
        invalidCount += 1;
        continue;
      }

      const transactionDong = typeof transactionValue.dong === 'string'
        ? transactionValue.dong.trim()
        : '';
      const dong = groupDong || transactionDong;
      const link = new URL(buildTransactionShareUrl({
        origin: LINK_BASE,
        apartment: {
          name: groupName,
          district,
          dong,
          masterId,
        },
        months: 2,
        tx: txKey({ date, area, floor, price }),
      }));
      parsed.push({
        name: groupName,
        dong,
        area: `${area}㎡`,
        floor: `${floor}층`,
        price: fmtEok(price),
        date: fmtDay(date),
        rawDate: date,
        href: `${link.pathname}${link.search}`,
      });
    }
  }

  parsed.sort((a, b) => b.rawDate.localeCompare(a.rawDate));
  return {
    rows: parsed.slice(0, 4),
    invalidCount,
  };
}

function getMessage(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export default function RecentDealsCard() {
  const storedRegion = useSyncExternalStore(subscribeHomeDistrict, getHomeDistrictSnapshot, getServerDistrict);
  const [sessionRegion, setSessionRegion] = useState<string | null>(null);
  const region = sessionRegion ?? storedRegion;

  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E7EAF0', borderRadius: 18,
      padding: 20, display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: '#12B76A', boxShadow: '0 0 0 4px #E6F7EE', flexShrink: 0 }} />
        <span style={{ fontWeight: 800, fontSize: 15, color: INK }}>최근 실거래</span>
      </div>
      <HomeDistrictPicker district={region || DEFAULT_HOME_DISTRICT} storageFailed={sessionRegion !== null}
        onSelect={(district) => setSessionRegion(saveHomeDistrict(district) ? null : district)} />
      {region ? <RecentDealsList key={region} region={region} /> : (
        <div role="status" style={{ color: '#6B7488', fontSize: 13, padding: '28px 4px' }}>관심 지역의 최근 실거래를 불러오는 중입니다.</div>
      )}
    </div>
  );
}

// A district change remounts only the list, so old rows cannot appear beneath
// the new district heading, including storage changes from another tab.
function RecentDealsList({ region }: { region: string }) {
  const [view, setView] = useState<DealsView>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setView({ kind: 'loading' });

    void (async () => {
      try {
        const response = await fetch(
          `/api/transactions?district=${encodeURIComponent(region)}&months=2&limit=60`,
          { signal: controller.signal },
        );
        const json: unknown = await response.json().catch(() => null);
        const body = isRecord(json) ? json : null;
        const apiError = getMessage(body?.error);

        if (!response.ok || apiError) {
          throw new Error(apiError ?? `실거래 요청이 실패했습니다. (HTTP ${response.status})`);
        }
        if (!body) {
          throw new Error('실거래 응답을 확인할 수 없습니다.');
        }

        const apiStatus = getMessage(body.status);
        const note = getMessage(body.note);
        if (!Array.isArray(body.data)) {
          if (apiStatus === 'degraded') {
            if (active) {
              setView({
                kind: 'degraded',
                message: note ?? '실거래 집계가 일시적으로 원활하지 않습니다.',
                rows: [],
              });
            }
            return;
          }
          throw new Error('실거래 응답 형식이 올바르지 않습니다.');
        }

        const { rows, invalidCount } = parseTransactions(body.data, region);
        if (!active) return;

        if (apiStatus === 'degraded' || invalidCount > 0) {
          setView({
            kind: 'degraded',
            message: note ?? (rows.length > 0
              ? '일부 거래를 확인하지 못해 검증된 거래만 표시합니다.'
              : '일부 실거래 응답을 확인할 수 없습니다.'),
            rows,
          });
          return;
        }

        setView(rows.length > 0 ? { kind: 'ready', rows } : { kind: 'empty' });
      } catch (loadError) {
        if (!active || (loadError instanceof Error && loadError.name === 'AbortError')) return;
        setView({
          kind: 'error',
          message: loadError instanceof Error
            ? loadError.message
            : '실거래를 불러오지 못했습니다.',
        });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, region]);

  const rows = view.kind === 'ready' || view.kind === 'degraded' ? view.rows : [];
  const retry = () => {
    setView({ kind: 'loading' });
    setAttempt((current) => current + 1);
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {view.kind === 'loading' && (
          <div role="status" aria-live="polite" style={{ color: '#6B7488', fontSize: 13, padding: '28px 4px', lineHeight: 1.5 }}>
            {region} 최근 실거래를 불러오는 중입니다.
          </div>
        )}

        {view.kind === 'empty' && (
          <div role="status" style={{ color: '#6B7488', fontSize: 13, padding: '28px 4px', lineHeight: 1.5 }}>
            최근 2개월에 확인된 {region} 매매 실거래가 없습니다.
          </div>
        )}

        {(view.kind === 'error' || view.kind === 'degraded') && (
          <div role="alert" style={{ color: '#6B7488', fontSize: 13, padding: rows.length > 0 ? '8px 0 10px' : '20px 4px', lineHeight: 1.5 }}>
            <div>{view.message}</div>
            <button
              type="button"
              onClick={retry}
              style={{
                marginTop: 9, border: '1px solid #D9DEEA', borderRadius: 8, background: '#FFFFFF',
                color: BLUE, fontWeight: 700, fontSize: 12, padding: '6px 10px', cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
          </div>
        )}

        {rows.map((tx) => (
          <Link
            key={tx.href}
            href={tx.href}
            aria-label={`${tx.name} ${tx.rawDate} 계약 ${tx.area} ${tx.floor} ${tx.price} 실거래 자세히 보기`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 0', borderBottom: '1px solid #F1F3F7', textDecoration: 'none',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tx.name}
              </div>
              <div style={{ fontSize: 11.5, color: '#8A93A3', marginTop: 2 }}>
                {[tx.dong, `전용 ${tx.area}`, tx.floor].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: BLUE, fontFamily: 'var(--font-sg, ui-monospace, monospace)' }}>{tx.price}</div>
              <div style={{ fontSize: 10.5, color: '#A0A8B5', marginTop: 2 }}>{tx.date}</div>
            </div>
          </Link>
        ))}
      </div>

      <Link
        href={`/transactions?district=${encodeURIComponent(region)}`}
        style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: BLUE, textDecoration: 'none' }}
      >
        {region} 실거래 더 보기 →
      </Link>
    </>
  );
}
