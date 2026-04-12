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
      padding: '0 24px',
      marginBottom: 'clamp(32px, 6vw, 48px)',
    }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <details style={{
          borderRadius: '14px',
          border: '1px solid var(--accent-border)',
          overflow: 'hidden',
        }}>
          <summary style={{
            padding: '18px 24px',
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--accent-text)',
            backgroundColor: 'var(--accent-bg)',
            cursor: 'pointer',
            listStyle: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>더 자세한 데이터 보기</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              style={{ transition: 'transform 0.2s' }}
            >
              <path
                d="M6 8L10 12L14 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <div style={{
            padding: '24px',
            backgroundColor: 'var(--bg-card)',
          }}>
            <RegionTable byRegion={byRegion} />
            <TopYearHighs items={topYearHighs} />
          </div>
        </details>
      </div>
    </section>
  );
}
