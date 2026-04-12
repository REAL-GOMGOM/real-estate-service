import type { YearHigh, RegionStats } from '@/lib/report/types';

interface CardDeckProps {
  topYearHighs: YearHigh[];
  byRegion: RegionStats[];
}

function formatKoreanPrice(won: number): string {
  const uk = Math.floor(won / 100_000_000);
  const man = Math.round((won % 100_000_000) / 10_000);
  if (uk >= 10000) {
    const jo = Math.floor(uk / 10000);
    const remainUk = uk % 10000;
    if (remainUk === 0) return `${jo}조`;
    return `${jo}조 ${remainUk.toLocaleString()}억`;
  }
  if (uk > 0 && man > 0) return `${uk.toLocaleString()}억 ${man.toLocaleString()}만원`;
  if (uk > 0) return `${uk.toLocaleString()}억`;
  if (man > 0) return `${man.toLocaleString()}만원`;
  return '0원';
}

function formatPercent(ratio: number): string {
  return `+${(ratio * 100).toFixed(1)}%`;
}

const cardBase: React.CSSProperties = {
  borderRadius: '20px',
  padding: 'clamp(28px, 5vw, 40px)',
  color: '#FFFFFF',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  boxShadow: 'var(--shadow-md)',
  aspectRatio: '4 / 5',
  minHeight: '320px',
};

function TopRiseCard({ item }: { item: YearHigh }) {
  return (
    <div style={{ ...cardBase, backgroundColor: '#C4654A' }}>
      <div>
        <p style={{ fontSize: '13px', opacity: 0.85, marginBottom: '8px', fontWeight: 500 }}>
          이번 주 최고 상승률
        </p>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <p style={{ fontSize: 'clamp(48px, 8vw, 64px)', fontWeight: 800, lineHeight: 1.1, marginBottom: '12px' }}>
          {formatPercent(item.increase)}
        </p>
        <p style={{ fontSize: 'clamp(16px, 2.5vw, 20px)', fontWeight: 600, marginBottom: '4px' }}>
          {item.apartment}
        </p>
        <p style={{ fontSize: '14px', opacity: 0.8 }}>
          {item.sigungu} {item.region}
        </p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '14px', opacity: 0.8 }}>
          {formatKoreanPrice(item.prevHigh)} → {formatKoreanPrice(item.newPrice)}
        </p>
      </div>
    </div>
  );
}

function TopRegionCard({ byRegion }: { byRegion: RegionStats[] }) {
  const top = [...byRegion].sort((a, b) => b.deals - a.deals)[0];
  return (
    <div style={{ ...cardBase, backgroundColor: '#6B8F71' }}>
      <div>
        <p style={{ fontSize: '13px', opacity: 0.85, marginBottom: '8px', fontWeight: 500 }}>
          거래가 가장 많은 지역
        </p>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <p style={{ fontSize: 'clamp(48px, 8vw, 64px)', fontWeight: 800, lineHeight: 1.1, marginBottom: '12px' }}>
          {top.deals.toLocaleString()}건
        </p>
        <p style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 600 }}>
          {top.sido}
        </p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '14px', opacity: 0.8 }}>
          1년 최고가 경신 {top.yearHighs.toLocaleString()}건
        </p>
      </div>
    </div>
  );
}

function AvgPriceCard({ byRegion }: { byRegion: RegionStats[] }) {
  const sorted = [...byRegion].sort((a, b) => b.avgPrice - a.avgPrice);
  return (
    <div style={{ ...cardBase, backgroundColor: '#D4A853' }}>
      <div>
        <p style={{ fontSize: '13px', opacity: 0.85, marginBottom: '8px', fontWeight: 500 }}>
          시도별 평균 거래가
        </p>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}>
        {sorted.map((r, i) => (
          <div key={r.sido} style={{ textAlign: 'center' }}>
            <p style={{
              fontSize: i === 0 ? 'clamp(14px, 2vw, 16px)' : '13px',
              opacity: i === 0 ? 1 : 0.8,
              marginBottom: '4px',
              fontWeight: 500,
            }}>
              {r.sido}
            </p>
            <p style={{
              fontSize: i === 0 ? 'clamp(28px, 5vw, 36px)' : 'clamp(18px, 3vw, 22px)',
              fontWeight: i === 0 ? 800 : 600,
              opacity: i === 0 ? 1 : 0.85,
            }}>
              {formatKoreanPrice(r.avgPrice)}
            </p>
          </div>
        ))}
      </div>
      <div />
    </div>
  );
}

export default function CardDeck({ topYearHighs, byRegion }: CardDeckProps) {
  const topItem = topYearHighs[0];

  return (
    <section style={{
      padding: '0 24px',
      marginBottom: 'clamp(40px, 8vw, 64px)',
    }}>
      <div style={{
        maxWidth: '960px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
        gap: '20px',
      }}>
        {topItem && <TopRiseCard item={topItem} />}
        <TopRegionCard byRegion={byRegion} />
        <AvgPriceCard byRegion={byRegion} />
      </div>
    </section>
  );
}
