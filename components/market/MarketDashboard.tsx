'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Trophy, Flame, BarChart3 } from 'lucide-react';

const MONO = "'Roboto Mono', var(--font-mono, monospace)";

/* ── Types ── */

interface PriceChangeData {
  period: string;
  frequency: 'monthly';
  type: 'sale' | 'rent';
  summary: { nationwide: number; capital_area: number; non_capital: number };
  regions: { code: string; name: string; change_rate: number; direction: string }[];
}

interface TopPriceItem {
  rank: number;
  aptName: string;
  district: string;
  price: number;
  priceFormatted: string;
  area: number;
  floor: number;
  dealDate: string;
}

interface VolumeItem {
  rank: number;
  aptName: string;
  district: string;
  count: number;
  avgPriceFormatted: string;
}

interface RankingData {
  status: 'ok' | 'partial';
  note?: string;
  period: string;
  area: string;
  updatedAt: string;
  coverage: {
    source: string;
    districtCount: number;
    transactionCount: number;
    from: string;
    toExclusive: string;
    firstDealDate: string | null;
    lastDealDate: string | null;
    label: string;
  };
  topPrice: Record<string, TopPriceItem[]>;
  volume: Record<string, VolumeItem[]>;
  newHigh: Record<string, unknown[]>;
  priceChange: {
    regions: { rank: number; name: string; changeRate: number; direction: string }[];
    seoulDistricts: { rank: number; name: string; changeRate: number; direction: string }[];
  };
}

interface CofixData {
  rate: number;
  period: string;
  name: string;
}

const ALL_REGISTERED = '등록 표본 전체';

/* ── Helpers ── */

function fmtRate(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isArrayMap(value: unknown, isItem: (item: unknown) => boolean): boolean {
  return isObject(value)
    && Object.values(value).every((items) => Array.isArray(items) && items.every(isItem));
}

function isRankingData(value: unknown): value is RankingData {
  if (!isObject(value) || (value.status !== 'ok' && value.status !== 'partial')) return false;
  if (value.note !== undefined && typeof value.note !== 'string') return false;
  const coverage = value.coverage;
  const priceChange = value.priceChange;
  if (!isObject(coverage)
    || typeof coverage.source !== 'string'
    || !isFiniteNumber(coverage.districtCount)
    || !isFiniteNumber(coverage.transactionCount)
    || typeof coverage.from !== 'string'
    || typeof coverage.toExclusive !== 'string'
    || typeof coverage.label !== 'string') return false;
  if (!isArrayMap(value.topPrice, (item) => isObject(item)
    && typeof item.aptName === 'string'
    && typeof item.district === 'string'
    && typeof item.priceFormatted === 'string')) return false;
  if (!isArrayMap(value.volume, (item) => isObject(item)
    && typeof item.aptName === 'string'
    && typeof item.district === 'string'
    && isFiniteNumber(item.count)
    && typeof item.avgPriceFormatted === 'string')) return false;
  if (!isArrayMap(value.newHigh, isObject) || !isObject(priceChange)) return false;
  return Array.isArray(priceChange.regions)
    && Array.isArray(priceChange.seoulDistricts)
    && priceChange.seoulDistricts.every((item) => isObject(item)
      && typeof item.name === 'string'
      && isFiniteNumber(item.changeRate));
}

function formatCoverageDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : value;
}

function rateColor(n: number): string {
  if (n > 0.01) return '#E23B3B';
  if (n < -0.01) return '#5B82E8';
  return 'var(--text-muted)';
}

// 같은 화면의 세 집계값 중 상대 위치만 표시한다(시장 판정 임계값 아님).
function rateToPosition(rate: number, maxAbs: number): number {
  return 50 + (rate / Math.max(maxAbs, 0.01)) * 50;
}

// ranking topPrice 키 → 짧은 시도명
const REGION_SHORT: Record<string, string> = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구',
  '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
  '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기',
  '강원특별자치도': '강원', '충청북도': '충북', '충청남도': '충남',
  '전북특별자치도': '전북', '전라남도': '전남', '경상북도': '경북',
  '경상남도': '경남', '제주특별자치도': '제주',
};

/* ── Component ── */

export default function MarketDashboard() {
  const router = useRouter();
  const [priceData, setPriceData] = useState<PriceChangeData | null>(null);
  const [ranking, setRanking] = useState<RankingData | null>(null);
  const [cofix, setCofix] = useState<CofixData | null>(null);
  const [priceErr, setPriceErr] = useState(false);
  const [rankErr, setRankErr] = useState(false);
  const [cofixErr, setCofixErr] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const isAbort = (error: unknown) => controller.signal.aborted
      || (error instanceof DOMException && error.name === 'AbortError');

    fetch('/api/price-change?type=sale', { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data.frequency !== 'monthly' || !Array.isArray(data.regions)) {
          throw new Error(data.error || `가격지수 API HTTP ${response.status}`);
        }
        return data as PriceChangeData;
      })
      .then(setPriceData)
      .catch((error) => { if (!isAbort(error)) setPriceErr(true); });

    fetch('/api/ranking?period=3&area=all', { signal: controller.signal })
      .then(async (response) => {
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok || !isRankingData(data)) {
          throw new Error(`랭킹 API HTTP ${response.status}`);
        }
        return data;
      })
      .then(setRanking)
      .catch((error) => { if (!isAbort(error)) setRankErr(true); });

    fetch('/api/loan/cofix', { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || typeof data.rate !== 'number' || !Number.isFinite(data.rate)) {
          throw new Error(data.error || `대출평균금리 API HTTP ${response.status}`);
        }
        return data as CofixData;
      })
      .then(setCofix)
      .catch((error) => { if (!isAbort(error)) setCofixErr(true); });

    return () => controller.abort();
  }, []);

  function handleSearch() {
    if (searchQuery.trim()) {
      router.push(`/chart?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  }

  const seoulRegion = priceData?.regions.find((r) => r.code === '11');
  const topNation = ranking?.topPrice?.[ALL_REGISTERED]?.[0];
  const topVolume = ranking?.volume?.[ALL_REGISTERED]?.[0];
  const topDistrict = ranking?.priceChange?.seoulDistricts?.[0];

  return (
    <main style={{ paddingTop: 80, paddingBottom: 48, minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>

        {/* ═══ ① 시장 온도계 ═══ */}
        <section style={{ marginBottom: 48 }}>
          {priceData ? (
            <TemperatureGauge data={priceData} />
          ) : priceErr ? (
            <ErrorCard text="시세 변동 데이터를 불러올 수 없습니다" />
          ) : (
            <Skeleton height={200} />
          )}
        </section>

        {/* ═══ ② 핵심 숫자 4개 ═══ */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }} className="market-stat-grid">
            {priceData && seoulRegion ? (
              <StatCard label="서울 월간" value={fmtRate(seoulRegion.change_rate)} sub={priceData.period} color={rateColor(seoulRegion.change_rate)} />
            ) : <Skeleton height={110} />}

            {priceData ? (
              <StatCard label="수도권 월간" value={fmtRate(priceData.summary.capital_area)} sub={priceData.period} color={rateColor(priceData.summary.capital_area)} />
            ) : <Skeleton height={110} />}

            {ranking && topNation ? (
              <StatCard label="표본 최고가" value={topNation.priceFormatted} sub={topNation.aptName} color="var(--text-strong)" />
            ) : rankErr ? <ErrorCard text="랭킹 데이터 없음" small /> : <Skeleton height={110} />}

            {cofix ? (
              <StatCard
                label="예금은행 대출평균금리"
                value={`${cofix.rate}%`}
                sub={`${cofix.period} · 한국은행 ECOS`}
                color="var(--text-strong)"
              />
            ) : cofixErr ? (
              <ErrorCard text="대출평균금리 데이터 없음" small />
            ) : (
              <Skeleton height={110} />
            )}
          </div>
          {ranking?.status === 'partial' && (
            <p
              role="alert"
              style={{
                margin: '12px 0 0', padding: '10px 12px', borderRadius: 10,
                border: '1px solid #D99B3D66', backgroundColor: '#D99B3D14',
                color: '#A86613', fontSize: 12, lineHeight: 1.6,
              }}
            >
              {ranking.note ?? '랭킹 부가 지표가 부분 집계되었습니다.'}
              {' '}{ranking.coverage.label}, {ranking.coverage.transactionCount.toLocaleString()}건의 실거래 범위는 유지됩니다.
            </p>
          )}
        </section>

        {/* ═══ ③ 시도별 월간 가격지수 카드 ═══ */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 20 }}>
            시도별 월간 가격지수 변동률
          </h2>
          {priceData ? (
            <RegionCards priceData={priceData} ranking={ranking} />
          ) : priceErr ? (
            <ErrorCard text="시도별 데이터를 불러올 수 없습니다" />
          ) : (
            <Skeleton height={220} />
          )}
        </section>

        {/* ═══ ④ 등록 표본의 최근 3개월 주목 거래 ═══ */}
        {ranking && (topNation || topVolume || topDistrict) && (
          <section style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 20 }}>
              등록 표본의 최근 3개월 주목 거래
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '-12px 0 16px' }}>
              {ranking.coverage.label} · {ranking.coverage.transactionCount.toLocaleString()}건
              {' · '}{formatCoverageDate(ranking.coverage.from)} 이상 ~ {formatCoverageDate(ranking.coverage.toExclusive)} 미만
            </p>
            <div style={{
              display: 'flex', borderRadius: 16,
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
              overflow: 'hidden',
            }} className="market-highlight-row">
              {topNation && (
                <HighlightItem
                  icon={<Trophy size={16} />}
                  label="표본 최고가"
                  value={`${topNation.aptName} ${topNation.priceFormatted}`}
                  onClick={() => router.push('/ranking')}
                />
              )}
              {topVolume && (
                <HighlightItem
                  icon={<Flame size={16} />}
                  label="표본 최다거래"
                  value={`${topVolume.aptName} ${topVolume.count}건`}
                  border
                  onClick={() => router.push('/ranking')}
                />
              )}
              {topDistrict && (
                <HighlightItem
                  icon={<BarChart3 size={16} />}
                  label="최고상승"
                  value={`${topDistrict.name} ${fmtRate(topDistrict.changeRate)}`}
                  border
                  onClick={() => router.push('/ranking')}
                />
              )}
            </div>
          </section>
        )}

        {/* ═══ ⑤ 빠른 검색 ═══ */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-strong)', marginBottom: 20 }}>
              시세 검색
            </h2>
            <div style={{ position: 'relative' }}>
              <Search size={20} style={{
                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-dim)',
              }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="아파트 이름으로 시세 검색..."
                style={{
                  width: '100%', padding: '16px 16px 16px 48px',
                  borderRadius: 12, fontSize: 16,
                  backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 10 }}>
              시세 차트, 거래 이력, 면적별 가격을 확인할 수 있습니다
            </p>
          </div>
        </section>
      </div>

      {/* 반응형 스타일 */}
      <style>{`
        @media (max-width: 768px) {
          .market-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .market-highlight-row { flex-direction: column !important; }
        }
      `}</style>
    </main>
  );
}

/* ── Sub-components ── */

function TemperatureGauge({ data }: { data: PriceChangeData }) {
  const capital = data.summary.capital_area;
  const items = [
    { label: '전국', rate: data.summary.nationwide },
    { label: '수도권', rate: data.summary.capital_area },
    { label: '지방', rate: data.summary.non_capital },
  ];
  const maxAbs = Math.max(...items.map((item) => Math.abs(item.rate)), 0.01);

  return (
    <div style={{
      padding: 32, borderRadius: 20,
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
    }}>
      {/* 원자료 집계값 */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 6px' }}>
          수도권 월간 변동률 {fmtRate(capital)}
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
          월간 {data.period} · 아래 위치는 세 집계값 안의 상대 비교이며 상승·하락 적합성 판정이 아닙니다.
        </p>
      </div>

      {/* 3개 변동률 + 게이지 */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {items.map((item) => (
          <div key={item.label} style={{ flex: '1 1 200px', minWidth: 180 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{item.label}</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: rateColor(item.rate), fontFamily: MONO }}>
                {fmtRate(item.rate)}
              </span>
            </div>
            {/* 게이지 바 */}
            <div style={{
              height: 8, borderRadius: 4, position: 'relative',
              background: 'linear-gradient(to right, #5B82E8, #9CA3AF 50%, #E23B3B)',
            }}>
              <div style={{
                position: 'absolute', top: -3,
                left: `${rateToPosition(item.rate, maxAbs)}%`,
                transform: 'translateX(-50%)',
                width: 14, height: 14, borderRadius: 7,
                backgroundColor: rateColor(item.rate),
                border: '2px solid var(--bg-card)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                transition: 'left 0.3s',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      padding: 20, borderRadius: 16,
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
    }}>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 800, color, margin: 0, fontFamily: MONO, lineHeight: 1.2 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>}
    </div>
  );
}

function RegionCards({ priceData, ranking }: { priceData: PriceChangeData; ranking: RankingData | null }) {
  // priceChange regions → 시도 카드
  const regions = priceData.regions.filter((r) => r.code !== '00'); // 전국 제외

  return (
    <div style={{ position: 'relative' }}>
      {/* 페이드 힌트 */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 48,
        background: 'linear-gradient(to left, var(--bg-primary), transparent)',
        zIndex: 1, pointerEvents: 'none',
      }} />
      <div style={{
        display: 'flex', gap: 16, overflowX: 'auto',
        scrollSnapType: 'x mandatory', paddingBottom: 8, paddingRight: 48,
        scrollbarWidth: 'none',
      }} className="hide-scrollbar">
        {regions.map((region) => {
          const fullName = Object.keys(REGION_SHORT).find((k) => REGION_SHORT[k] === region.name);
          const topItems = fullName ? ranking?.topPrice?.[fullName]?.slice(0, 3) : undefined;

          return (
            <div key={region.code} style={{
              minWidth: 260, flex: '0 0 260px', scrollSnapAlign: 'start',
              padding: 18, borderRadius: 14,
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
            }}>
              {/* 시도명 + 변동률 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-strong)' }}>{region.name}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: rateColor(region.change_rate), fontFamily: MONO }}>
                  {fmtRate(region.change_rate)}
                </span>
              </div>

              {/* 미니 바 */}
              <div style={{ height: 4, borderRadius: 2, backgroundColor: 'var(--border)', marginBottom: 14 }}>
                <div style={{
                  height: 4, borderRadius: 2,
                  width: `${Math.min(100, Math.abs(region.change_rate) * 100)}%`,
                  backgroundColor: rateColor(region.change_rate),
                  transition: 'width 0.3s',
                }} />
              </div>

              {/* TOP 3 거래 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 72 }}>
                {topItems && topItems.length > 0 ? topItems.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                      {t.aptName}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: MONO, flexShrink: 0 }}>
                      {t.priceFormatted}
                    </span>
                  </div>
                )) : (
                  <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>거래 데이터 없음</p>
                )}
              </div>

              <p style={{ margin: '10px 0 0', fontSize: 10.5, color: 'var(--text-dim)' }}>
                시도 집계와 등록 표본 거래를 함께 표시
              </p>
            </div>
          );
        })}
      </div>
      <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}

function HighlightItem({ icon, label, value, border, onClick }: {
  icon: React.ReactNode; label: string; value: string; border?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 10,
        padding: '16px 20px', border: 'none', background: 'none',
        cursor: 'pointer', color: 'var(--text-primary)',
        borderLeft: border ? '1px solid var(--border-light)' : 'none',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <span style={{ color: 'var(--accent)', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </button>
  );
}

function Skeleton({ height }: { height: number }) {
  return (
    <div style={{
      height, borderRadius: 16,
      backgroundColor: 'var(--border-light)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

function ErrorCard({ text, small }: { text: string; small?: boolean }) {
  return (
    <div style={{
      padding: small ? 16 : 24, borderRadius: 16, textAlign: 'center',
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
    }}>
      <p style={{ fontSize: small ? 12 : 14, color: 'var(--text-dim)', margin: 0 }}>{text}</p>
    </div>
  );
}
