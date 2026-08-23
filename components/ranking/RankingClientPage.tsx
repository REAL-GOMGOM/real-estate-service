'use client';

import { useState, useEffect } from 'react';
import { Trophy, BarChart3, TrendingUp, Flame } from 'lucide-react';
import {
  buildRankingShareImage, shareOrDownloadImage, type RankingShareRow,
} from '@/lib/share-image';
import { SaveImageButton } from '@/components/shared/SaveImageButton';

// ── 타입 ────────────────────────────────────────────
interface TopPriceItem {
  rank: number; aptName: string; district: string; dong: string;
  price: number; priceFormatted: string;
  area: number; pyeong: number; floor: number; dealDate: string;
}
interface VolumeItem {
  rank: number; aptName: string; district: string; dong: string;
  count: number; avgPrice: number; avgPriceFormatted: string;
}
interface NewHighItem {
  rank: number; aptName: string; district: string; dong: string;
  price: number; prevHigh: number; diffPercent: number; diffFormatted: string;
}
interface PriceChangeItem {
  rank: number; name: string; changeRate: number; direction: 'up' | 'down' | 'flat';
}
interface RankingCoverage {
  source: string;
  districtCount: number;
  transactionCount: number;
  from: string;
  toExclusive: string;
  firstDealDate: string | null;
  lastDealDate: string | null;
  label: string;
}
interface RankingData {
  status: 'ok' | 'partial';
  note?: string;
  period: string; area: string; updatedAt: string;
  coverage: RankingCoverage;
  topPrice: Record<string, TopPriceItem[]>;
  volume: Record<string, VolumeItem[]>;
  newHigh: Record<string, NewHighItem[]>;
  priceChange: { regions: PriceChangeItem[]; seoulDistricts: PriceChangeItem[] };
}

type RankingResult =
  | { key: string; state: 'success'; data: RankingData }
  | { key: string; state: 'error' };

type TabKey = 'topPrice' | 'volume' | 'newHigh' | 'priceChange';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'topPrice',    label: '최고가',  icon: <Trophy size={14} /> },
  { key: 'volume',      label: '거래TOP', icon: <BarChart3 size={14} /> },
  { key: 'newHigh',     label: '신고가',  icon: <Flame size={14} /> },
  { key: 'priceChange', label: '상승률',  icon: <TrendingUp size={14} /> },
];
const AREA_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: '59',  label: '59㎡대' },
  { key: '84',  label: '84㎡대' },
  { key: 'large', label: '87㎡ 이상' },
];
const PERIOD_OPTIONS = [
  { key: '3',  label: '최근 3개월' },
  { key: '12', label: '최근 1년' },
];

const MEDAL: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
const ALL_REGISTERED = '등록 표본 전체';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTopPriceItem(value: unknown): value is TopPriceItem {
  if (!isObject(value)) return false;
  return isFiniteNumber(value.rank)
    && typeof value.aptName === 'string'
    && typeof value.district === 'string'
    && typeof value.dong === 'string'
    && isFiniteNumber(value.price)
    && typeof value.priceFormatted === 'string'
    && isFiniteNumber(value.area)
    && isFiniteNumber(value.pyeong)
    && isFiniteNumber(value.floor)
    && typeof value.dealDate === 'string';
}

function isVolumeItem(value: unknown): value is VolumeItem {
  if (!isObject(value)) return false;
  return isFiniteNumber(value.rank)
    && typeof value.aptName === 'string'
    && typeof value.district === 'string'
    && typeof value.dong === 'string'
    && isFiniteNumber(value.count)
    && isFiniteNumber(value.avgPrice)
    && typeof value.avgPriceFormatted === 'string';
}

function isNewHighItem(value: unknown): value is NewHighItem {
  if (!isObject(value)) return false;
  return isFiniteNumber(value.rank)
    && typeof value.aptName === 'string'
    && typeof value.district === 'string'
    && typeof value.dong === 'string'
    && isFiniteNumber(value.price)
    && isFiniteNumber(value.prevHigh)
    && isFiniteNumber(value.diffPercent)
    && typeof value.diffFormatted === 'string';
}

function isPriceChangeItem(value: unknown): value is PriceChangeItem {
  if (!isObject(value)) return false;
  return isFiniteNumber(value.rank)
    && typeof value.name === 'string'
    && isFiniteNumber(value.changeRate)
    && (value.direction === 'up' || value.direction === 'down' || value.direction === 'flat');
}

function isRankingMap<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is Record<string, T[]> {
  return isObject(value)
    && Object.values(value).every((items) => Array.isArray(items) && items.every(isItem));
}

function isCoverage(value: unknown): value is RankingCoverage {
  if (!isObject(value)) return false;
  return typeof value.source === 'string'
    && isFiniteNumber(value.districtCount)
    && isFiniteNumber(value.transactionCount)
    && typeof value.from === 'string'
    && typeof value.toExclusive === 'string'
    && (typeof value.firstDealDate === 'string' || value.firstDealDate === null)
    && (typeof value.lastDealDate === 'string' || value.lastDealDate === null)
    && typeof value.label === 'string';
}

function isRankingData(value: unknown): value is RankingData {
  if (!isObject(value) || (value.status !== 'ok' && value.status !== 'partial')) return false;
  if (value.note !== undefined && typeof value.note !== 'string') return false;
  if (typeof value.period !== 'string' || typeof value.area !== 'string'
    || typeof value.updatedAt !== 'string' || !isCoverage(value.coverage)) return false;
  if (!isRankingMap(value.topPrice, isTopPriceItem)
    || !isRankingMap(value.volume, isVolumeItem)
    || !isRankingMap(value.newHigh, isNewHighItem)) return false;
  if (!isObject(value.priceChange)) return false;
  return Array.isArray(value.priceChange.regions)
    && value.priceChange.regions.every(isPriceChangeItem)
    && Array.isArray(value.priceChange.seoulDistricts)
    && value.priceChange.seoulDistricts.every(isPriceChangeItem);
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const match = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return value;
  return match[3] ? `${match[1]}.${match[2]}.${match[3]}` : `${match[1]}.${match[2]}`;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function formatPrice(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

// ── 순위 뱃지 ───────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  const color = MEDAL[rank] || 'var(--text-dim)';
  const isMedal = rank <= 3;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '26px', height: '26px', borderRadius: '8px', flexShrink: 0,
      fontSize: '12px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace',
      backgroundColor: isMedal ? color + '22' : 'var(--border-light)',
      color: isMedal ? color : 'var(--text-dim)',
      border: isMedal ? `1.5px solid ${color}44` : '1px solid var(--border)',
    }}>
      {rank === 1 ? '🏆' : rank}
    </span>
  );
}

// ── 카드 컴포넌트들 ─────────────────────────────────
function TopPriceCard({ item }: { item: TopPriceItem }) {
  return (
    <div style={rowStyle}>
      <RankBadge rank={item.rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={nameStyle}>{item.aptName}</p>
        <p style={subStyle}>{item.district} {item.dong} · {item.area}㎡({item.pyeong}평) · {item.floor}층</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ ...priceStyle, color: 'var(--text-primary)' }}>{item.priceFormatted}</p>
        <p style={{ ...subStyle, marginTop: '1px' }}>{formatDate(item.dealDate)}</p>
      </div>
    </div>
  );
}

function VolumeCard({ item }: { item: VolumeItem }) {
  return (
    <div style={rowStyle}>
      <RankBadge rank={item.rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={nameStyle}>{item.aptName}</p>
        <p style={subStyle}>{item.district} {item.dong} · 평균 {item.avgPriceFormatted}</p>
      </div>
      <p style={{ ...priceStyle, color: '#F0A24B' }}>
        {item.count}<span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-dim)' }}>건</span>
      </p>
    </div>
  );
}

function NewHighCard({ item }: { item: NewHighItem }) {
  return (
    <div style={rowStyle}>
      <RankBadge rank={item.rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={nameStyle}>{item.aptName}</p>
        <p style={subStyle}>{item.district} {item.dong} · 이전 {formatPrice(item.prevHigh)}</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ ...priceStyle, color: '#2E7A4C' }}>{formatPrice(item.price)}</p>
        <p style={{ fontSize: '11px', color: '#2E7A4C', fontFamily: 'Roboto Mono, monospace' }}>{item.diffFormatted} ({item.diffPercent}%)</p>
      </div>
    </div>
  );
}

function PriceChangeCard({ item }: { item: PriceChangeItem }) {
  const isUp = item.direction === 'up';
  const color = isUp ? '#2E7A4C' : item.direction === 'down' ? '#E23B3B' : 'var(--text-dim)';
  return (
    <div style={rowStyle}>
      <RankBadge rank={item.rank} />
      <p style={{ ...nameStyle, flex: 1 }}>{item.name}</p>
      <p style={{ ...priceStyle, color }}>
        {isUp ? '+' : ''}{item.changeRate.toFixed(2)}%
      </p>
    </div>
  );
}

// ── 시도별 카드 ─────────────────────────────────────
function RegionCard({ title, onSave, children }: {
  title: string;
  onSave?: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      padding: '20px', borderRadius: '16px',
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
      transition: 'box-shadow 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {onSave && <SaveImageButton onSave={onSave} />}
      </div>
      {children}
    </div>
  );
}

function EmptyState() {
  return <p style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-dim)', fontSize: '13px' }}>데이터 없음</p>;
}

/** 탭별 랭킹 행 → 공유 카드 행 매핑 (사이클 CC) */
function toShareRows(tab: TabKey, items: unknown[]): RankingShareRow[] {
  return items.slice(0, 5).map((raw) => {
    if (tab === 'topPrice') {
      const it = raw as TopPriceItem;
      return {
        rank: it.rank, name: it.aptName,
        sub: `${it.district} ${it.dong} · ${it.area}㎡ · ${it.floor}층`,
        value: it.priceFormatted, valueSub: it.dealDate,
      };
    }
    if (tab === 'volume') {
      const it = raw as VolumeItem;
      return {
        rank: it.rank, name: it.aptName,
        sub: `${it.district} ${it.dong} · 평균 ${it.avgPriceFormatted}`,
        value: `${it.count}건`, valueColor: '#D97E1F',
      };
    }
    if (tab === 'newHigh') {
      const it = raw as NewHighItem;
      return {
        rank: it.rank, name: it.aptName,
        sub: `${it.district} ${it.dong} · 이전 ${formatPrice(it.prevHigh)}`,
        value: formatPrice(it.price),
        valueSub: `${it.diffFormatted} (${it.diffPercent}%)`, valueColor: '#2E7A4C',
      };
    }
    const it = raw as PriceChangeItem;
    return {
      rank: it.rank, name: it.name,
      value: `${it.direction === 'up' ? '+' : ''}${it.changeRate.toFixed(2)}%`,
      valueColor: it.direction === 'up' ? '#2E7A4C' : it.direction === 'down' ? '#E23B3B' : '#8A94A8',
    };
  });
}

// ── 메인 ────────────────────────────────────────────
export default function RankingClientPage() {
  const [tab, setTab] = useState<TabKey>('topPrice');
  const [area, setArea] = useState('all');
  const [period, setPeriod] = useState('3');
  const [reloadKey, setReloadKey] = useState(0);
  // 결과에 조회 키를 함께 저장 — loading 은 파생값 (effect 안 동기 setState 룰 회피, DealFeed 패턴)
  const [result, setResult] = useState<RankingResult | null>(null);

  const queryKey = `${period}-${area}-${reloadKey}`;
  useEffect(() => {
    const controller = new AbortController();
    const key = `${period}-${area}-${reloadKey}`;

    async function loadRanking() {
      try {
        const response = await fetch(`/api/ranking?period=${period}&area=${area}`, {
          signal: controller.signal,
        });
        const json: unknown = await response.json().catch(() => null);
        if (!response.ok || !isRankingData(json)) throw new Error('잘못된 랭킹 응답');
        if (!controller.signal.aborted) setResult({ key, state: 'success', data: json });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
        setResult({ key, state: 'error' });
      }
    }

    void loadRanking();
    return () => controller.abort();
  }, [period, area, reloadKey]);

  const loading = result === null || result.key !== queryKey;
  const data = !loading && result.state === 'success' ? result.data : null;
  const failed = !loading && result.state === 'error';

  const regionNames = data
    ? Array.from(new Set([
      ...Object.keys(data.topPrice),
      ...Object.keys(data.volume),
      ...Object.keys(data.newHigh),
    ])).filter((key) => key !== ALL_REGISTERED)
    : [];

  // 카드 → 브랜드 공유 이미지 (사이클 CC — silgga식 캡처 공유의 전용 렌더 버전)
  const saveCard = async (cardTitle: string, items: unknown[]) => {
    if (!data) return;
    const tabLabel = TABS.find((t) => t.key === tab)?.label ?? '';
    const dateStr = formatDate(data.updatedAt);
    const periodLabel = PERIOD_OPTIONS.find((o) => o.key === period)?.label ?? '';
    const areaLabel = tab !== 'priceChange'
      ? ` · ${AREA_OPTIONS.find((o) => o.key === area)?.label} 면적` : '';

    const blob = await buildRankingShareImage({
      title: tab === 'priceChange' ? `${cardTitle} TOP` : `${tabLabel} TOP — ${cardTitle}`,
      subtitle: `${periodLabel}${areaLabel} · ${dateStr} 기준`,
      rows: toShareRows(tab, items),
      source: tab === 'priceChange' ? '한국부동산원 매매가격지수' : data.coverage.source,
    });
    if (blob) {
      await shareOrDownloadImage(
        blob,
        `내집-실거래랭킹-${tabLabel}-${cardTitle}.png`,
        `실거래 랭킹 ${tabLabel} — ${cardTitle}`,
      );
    }
  };

  function renderTab() {
    if (!data) return null;

    if (tab === 'priceChange') {
      const { regions, seoulDistricts } = data.priceChange;
      return (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
          gap: '16px',
        }}>
          <RegionCard title="시도별 상승률" onSave={regions.length > 0 ? () => saveCard('시도별 상승률', regions) : undefined}>
            {regions.length > 0
              ? <div style={listStyle}>{regions.map((it) => <PriceChangeCard key={it.rank} item={it} />)}</div>
              : <EmptyState />}
          </RegionCard>
          <RegionCard title="서울 구별 상승률" onSave={seoulDistricts.length > 0 ? () => saveCard('서울 구별 상승률', seoulDistricts) : undefined}>
            {seoulDistricts.length > 0
              ? <div style={listStyle}>{seoulDistricts.map((it) => <PriceChangeCard key={it.rank} item={it} />)}</div>
              : <EmptyState />}
          </RegionCard>
        </div>
      );
    }

    const allRegions = [ALL_REGISTERED, ...regionNames];
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
        gap: '16px',
      }}>
        {allRegions.map((region) => {
          const items = tab === 'topPrice' ? data.topPrice[region]
            : tab === 'volume' ? data.volume[region]
            : data.newHigh[region];
          return (
            <RegionCard
              key={region}
              title={region}
              onSave={items && items.length > 0 ? () => saveCard(region, items) : undefined}
            >
              {items && items.length > 0 ? (
                <div style={listStyle}>
                  {items.map((it) =>
                    tab === 'topPrice' ? <TopPriceCard key={it.rank} item={it as TopPriceItem} />
                    : tab === 'volume' ? <VolumeCard key={it.rank} item={it as VolumeItem} />
                    : <NewHighCard key={it.rank} item={it as NewHighItem} />
                  )}
                </div>
              ) : <EmptyState />}
            </RegionCard>
          );
        })}
      </div>
    );
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>

        {/* 헤더 */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
            실거래 랭킹
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            등록된 시군구의 공개 실거래로 최고가, 거래량, 신고가를 비교합니다.
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              {' · '}{PERIOD_OPTIONS.find((o) => o.key === period)?.label}
              {tab !== 'priceChange' && ` · ${AREA_OPTIONS.find((o) => o.key === area)?.label} 면적`}
            </span>
          </p>
        </div>

        {data && (
          <section
            aria-label="랭킹 집계 범위"
            role={data.status === 'partial' ? 'alert' : undefined}
            style={{
              marginBottom: '20px', padding: '14px 16px', borderRadius: '12px',
              border: `1px solid ${data.status === 'partial' ? '#D99B3D66' : 'var(--border)'}`,
              backgroundColor: data.status === 'partial' ? '#D99B3D14' : 'var(--bg-card)',
              color: 'var(--text-muted)', fontSize: '12px', lineHeight: 1.7,
            }}
          >
            <p style={{ margin: 0, fontWeight: 700, color: data.status === 'partial' ? '#A86613' : 'var(--text-primary)' }}>
              {data.status === 'partial' ? '일부 지표 미집계' : '등록 표본 집계'}
            </p>
            <p style={{ margin: '2px 0 0' }}>
              {data.coverage.label}
              {' · '}실거래 {data.coverage.transactionCount.toLocaleString()}건
              {' · '}조회 범위 {formatDate(data.coverage.from)} 이상 ~ {formatDate(data.coverage.toExclusive)} 미만
            </p>
            <p style={{ margin: 0 }}>
              {data.coverage.firstDealDate && data.coverage.lastDealDate
                ? `실제 포함 거래일 ${formatDate(data.coverage.firstDealDate)} ~ ${formatDate(data.coverage.lastDealDate)}`
                : '조회 범위에 포함된 거래가 없습니다.'}
              {' · '}응답 생성 {formatUpdatedAt(data.updatedAt)}
            </p>
            {data.status === 'partial' && (
              <p style={{ margin: '4px 0 0' }}>
                {data.note ?? '일부 부가 지표를 가져오지 못했습니다.'}
                {' '}실거래 랭킹은 위 표본 범위 기준입니다.
              </p>
            )}
          </section>
        )}

        {/* 탭 */}
        <div style={{
          display: 'flex', gap: '4px', marginBottom: '16px', padding: '4px',
          borderRadius: '12px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
          overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        }} role="group" aria-label="랭킹 종류">
          {TABS.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              type="button"
              aria-pressed={tab === key}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
                padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                backgroundColor: tab === key ? 'var(--accent)' : 'transparent',
                color: tab === key ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* 필터 */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 면적 */}
            <div role="group" aria-label="면적 필터" style={{
              display: 'flex', gap: '4px', padding: '3px', borderRadius: '10px', backgroundColor: 'var(--border-light)',
              opacity: tab === 'priceChange' ? 0.4 : 1,
              pointerEvents: tab === 'priceChange' ? 'none' : 'auto',
            }}>
              {AREA_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.key}
                  onClick={() => setArea(opt.key)}
                  disabled={tab === 'priceChange'}
                  aria-pressed={area === opt.key}
                  style={{
                    padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                    border: 'none', cursor: 'pointer',
                    backgroundColor: area === opt.key ? 'var(--bg-card)' : 'transparent',
                    color: area === opt.key ? 'var(--text-primary)' : 'var(--text-dim)',
                    boxShadow: area === opt.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 구분선 */}
            <div aria-hidden="true" style={{ width: '1px', height: '24px', backgroundColor: 'var(--border)' }} />
            {/* 기간 */}
            <div role="group" aria-label="조회 기간" style={{ display: 'flex', gap: '4px', padding: '3px', borderRadius: '10px', backgroundColor: 'var(--border-light)' }}>
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.key}
                  onClick={() => setPeriod(opt.key)}
                  aria-pressed={period === opt.key}
                  style={{
                    padding: '6px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                    border: 'none', cursor: 'pointer',
                    backgroundColor: period === opt.key ? 'var(--bg-card)' : 'transparent',
                    color: period === opt.key ? 'var(--text-primary)' : 'var(--text-dim)',
                    boxShadow: period === opt.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
        </div>

        {/* 콘텐츠 */}
        <div id="ranking-results" aria-live="polite">
        {loading ? (
          <div role="status" aria-live="polite" style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-dim)' }}>
            <div style={{ width: '32px', height: '32px', margin: '0 auto 12px', borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: '14px' }}>랭킹 데이터 수집 중...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : data ? renderTab() : failed ? (
          <div role="alert" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)', fontSize: '14px' }}>
            <p>랭킹 데이터를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.</p>
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              style={{
                marginTop: '12px', padding: '8px 14px', borderRadius: '8px',
                border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
          </div>
        ) : null}
        </div>

        {/* 면책 */}
        <p style={{
          marginTop: '48px', padding: '16px 20px', borderRadius: '12px',
          backgroundColor: 'var(--border-light)', fontSize: '12px',
          color: 'var(--text-dim)', lineHeight: 1.8,
        }}>
          ※ 거래량·최고가·신고가는 위에 표시된 등록 시군구의 국토교통부 실거래 표본 기준입니다.
          상승률은 한국부동산원 월간 매매가격지수 기준이며, 신고 지연·정정·해제 등으로 수치가 바뀔 수 있습니다.
        </p>
      </div>
    </main>
  );
}

// ── 공통 스타일 ─────────────────────────────────────
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '12px',
  padding: '12px 0', borderBottom: '1px solid var(--border-light)',
};
const nameStyle: React.CSSProperties = {
  fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)',
  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
};
const subStyle: React.CSSProperties = {
  fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px',
};
const priceStyle: React.CSSProperties = {
  fontSize: '14px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace',
};
const listStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
};
