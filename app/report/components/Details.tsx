import type { RegionStats, YearHigh } from '@/lib/report/types';
import RegionTable from './RegionTable';
import TopYearHighs from './TopYearHighs';

interface DetailsProps {
  byRegion: RegionStats[];
  topYearHighs: YearHigh[];
}

export default function Details({ byRegion, topYearHighs }: DetailsProps) {
  return (
    <section style={{
      maxWidth: 'var(--container-default)',
      margin: '0 auto',
      padding: 'var(--space-6) var(--page-padding) var(--space-9)',
    }}>
      <details>
        <summary style={{
          cursor: 'pointer',
          padding: 'var(--space-4) var(--space-5)',
          fontSize: 'var(--font-h3)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          listStyle: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}>
          <span
            className="details-chevron"
            style={{
              display: 'inline-flex',
              fontSize: 'var(--font-body)',
              color: 'var(--text-dim)',
              flexShrink: 0,
            }}
          >
            ▸
          </span>
          <span>더 자세한 데이터 보기</span>
        </summary>

        <div style={{
          marginTop: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-7)',
        }}>
          <RegionTable byRegion={byRegion} />
          <TopYearHighs items={topYearHighs} />
        </div>
      </details>
    </section>
  );
}
