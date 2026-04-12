import type { YearHigh, RegionStats } from '@/lib/report/types';
import { formatKoreanPrice, formatPercent } from '@/lib/report/format';

interface CardDeckProps {
  topYearHighs: YearHigh[];
  byRegion: RegionStats[];
}

const cardBase: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  borderRadius: '16px',
  border: '1px solid var(--border)',
  padding: 'var(--space-6)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  minHeight: '220px',
  overflowWrap: 'break-word' as const,
};

function CardLabel({ text }: { text: string }) {
  return (
    <p style={{
      fontSize: 'var(--font-sm)',
      color: 'var(--text-dim)',
      letterSpacing: '0.05em',
      textTransform: 'uppercase' as const,
      fontWeight: 500,
    }}>
      {text}
    </p>
  );
}

function TopRiseCard({ item }: { item: YearHigh }) {
  return (
    <article style={{
      ...cardBase,
      borderLeft: '4px solid var(--accent)',
    }}>
      <CardLabel text="최고 상승률" />
      <p style={{
        fontSize: 'var(--font-display)',
        fontWeight: 700,
        color: 'var(--accent)',
        lineHeight: 'var(--line-tight)',
      }}>
        {formatPercent(item.increase)}
      </p>
      <p style={{
        fontSize: 'var(--font-h3)',
        fontWeight: 600,
        color: 'var(--text-primary)',
        lineHeight: 'var(--line-snug)',
      }}>
        {item.apartment}
      </p>
      <p style={{
        fontSize: 'var(--font-sm)',
        color: 'var(--text-muted)',
      }}>
        {item.sido} {item.sigungu}
      </p>
      <p style={{
        fontSize: 'var(--font-sm)',
        color: 'var(--text-dim)',
      }}>
        {formatKoreanPrice(item.prevHigh)} → {formatKoreanPrice(item.newPrice)}
      </p>
    </article>
  );
}

function TopRegionCard({ byRegion }: { byRegion: RegionStats[] }) {
  const top = [...byRegion].sort((a, b) => b.deals - a.deals)[0];
  return (
    <article style={{
      ...cardBase,
      borderLeft: '4px solid var(--success)',
    }}>
      <CardLabel text="거래 집중 지역" />
      <p style={{
        fontSize: 'var(--font-display)',
        fontWeight: 700,
        color: 'var(--success)',
        lineHeight: 'var(--line-tight)',
      }}>
        {top.deals.toLocaleString()}건
      </p>
      <p style={{
        fontSize: 'var(--font-h3)',
        fontWeight: 600,
        color: 'var(--text-primary)',
        lineHeight: 'var(--line-snug)',
      }}>
        {top.sido}
      </p>
      <p style={{
        fontSize: 'var(--font-sm)',
        color: 'var(--text-muted)',
      }}>
        1년 최고가 경신 {top.yearHighs.toLocaleString()}건
      </p>
      <p style={{
        fontSize: 'var(--font-sm)',
        color: 'var(--text-dim)',
      }}>
        평균 {formatKoreanPrice(top.avgPrice, { compact: true })}
      </p>
    </article>
  );
}

function AvgPriceCard({ byRegion }: { byRegion: RegionStats[] }) {
  const sorted = [...byRegion].sort((a, b) => b.avgPrice - a.avgPrice);
  const top = sorted[0];
  const rest = sorted.slice(1);

  return (
    <article style={{
      ...cardBase,
      borderLeft: '4px solid var(--warning)',
    }}>
      <CardLabel text="시도별 평균가" />
      <p style={{
        fontSize: 'var(--font-display)',
        fontWeight: 700,
        color: 'var(--warning)',
        lineHeight: 'var(--line-tight)',
      }}>
        {formatKoreanPrice(top.avgPrice, { compact: true })}
      </p>
      <p style={{
        fontSize: 'var(--font-h3)',
        fontWeight: 600,
        color: 'var(--text-primary)',
        lineHeight: 'var(--line-snug)',
      }}>
        {top.sido}
      </p>
      <p style={{
        fontSize: 'var(--font-sm)',
        color: 'var(--text-muted)',
      }}>
        {rest.filter((r) => r.deals > 0).map((r) => `${r.sido} ${formatKoreanPrice(r.avgPrice, { compact: true })}`).join(' · ')}
      </p>
    </article>
  );
}

export default function CardDeck({ topYearHighs, byRegion }: CardDeckProps) {
  const topItem = topYearHighs[0];

  return (
    <section style={{
      maxWidth: 'var(--container-default)',
      margin: '0 auto',
      padding: 'var(--space-7) var(--page-padding)',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
        gap: 'var(--space-5)',
      }}>
        {topItem && <TopRiseCard item={topItem} />}
        <TopRegionCard byRegion={byRegion} />
        <AvgPriceCard byRegion={byRegion} />
      </div>
    </section>
  );
}
