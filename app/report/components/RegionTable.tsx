import type { RegionStats } from '@/lib/report/types';
import { formatKoreanPrice } from '@/lib/report/format';

interface RegionTableProps {
  byRegion: RegionStats[];
}

export default function RegionTable({ byRegion }: RegionTableProps) {
  return (
    <div>
      <h2 style={{
        fontSize: 'var(--font-h2)',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: 'var(--space-5)',
      }}>
        시도별 현황
      </h2>

      {/* Desktop table (>= 640px) */}
      <div className="region-desktop">
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--font-body)',
        }}>
          <thead>
            <tr>
              {['시도', '거래수', '1년 최고가 경신', '평균가'].map((col) => (
                <th
                  key={col}
                  style={{
                    padding: 'var(--space-4)',
                    textAlign: col === '시도' ? 'left' : 'right',
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    fontSize: 'var(--font-sm)',
                    letterSpacing: '0.05em',
                    borderBottom: '2px solid var(--border)',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byRegion.map((r) => (
              <tr
                key={r.sido}
                style={{
                  opacity: r.deals === 0 ? 0.5 : 1,
                }}
              >
                <td style={{
                  padding: 'var(--space-4)',
                  fontSize: 'var(--font-h3)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  borderBottom: '1px solid var(--border)',
                }}>
                  {r.sido}
                </td>
                <td style={{
                  padding: 'var(--space-4)',
                  textAlign: 'right',
                  fontSize: 'var(--font-body-lg)',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  borderBottom: '1px solid var(--border)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {r.deals.toLocaleString()}건
                </td>
                <td style={{
                  padding: 'var(--space-4)',
                  textAlign: 'right',
                  fontSize: 'var(--font-body-lg)',
                  fontWeight: 600,
                  color: 'var(--success)',
                  borderBottom: '1px solid var(--border)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {r.yearHighs.toLocaleString()}건
                </td>
                <td style={{
                  padding: 'var(--space-4)',
                  textAlign: 'right',
                  fontSize: 'var(--font-body-lg)',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  borderBottom: '1px solid var(--border)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatKoreanPrice(r.avgPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards (< 640px) */}
      <div className="region-mobile">
        {byRegion.map((r) => (
          <div
            key={r.sido}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-4)',
              opacity: r.deals === 0 ? 0.5 : 1,
            }}
          >
            <p style={{
              fontSize: 'var(--font-h3)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: 'var(--space-4)',
            }}>
              {r.sido}
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-3)',
            }}>
              <div>
                <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>거래수</p>
                <p style={{ fontSize: 'var(--font-body)', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{r.deals.toLocaleString()}건</p>
              </div>
              <div>
                <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>1년 최고가 경신</p>
                <p style={{ fontSize: 'var(--font-body)', fontWeight: 600, color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{r.yearHighs.toLocaleString()}건</p>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <p style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>평균가</p>
                <p style={{ fontSize: 'var(--font-body)', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatKoreanPrice(r.avgPrice)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
