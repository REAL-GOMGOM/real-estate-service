import type { YearHigh } from '@/lib/report/types';
import { formatKoreanPrice, formatPercent } from '@/lib/report/format';

interface TopYearHighsProps {
  items: YearHigh[];
}

function formatArea(area: number): string {
  return `${area.toFixed(2)}㎡`;
}

export default function TopYearHighs({ items }: TopYearHighsProps) {
  if (items.length === 0) return null;

  return (
    <div>
      <h2 style={{
        fontSize: 'var(--font-h2)',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: 'var(--space-5)',
      }}>
        1년 최고가 경신 TOP {items.length}
      </h2>

      {/* Desktop table (>= 768px) */}
      <div className="report-desktop">
        <div style={{
          overflowX: 'auto',
          borderRadius: '12px',
          border: '1px solid var(--border)',
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 'var(--font-body)',
            minWidth: '700px',
          }}>
            <thead>
              <tr>
                {['#', '단지명', '위치', '면적', '거래가', '상승률'].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: 'var(--space-4)',
                      textAlign: col === '#' ? 'center' : col === '거래가' || col === '상승률' || col === '면적' ? 'right' : 'left',
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                      fontSize: 'var(--font-sm)',
                      letterSpacing: '0.05em',
                      borderBottom: '2px solid var(--border)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr
                  key={`${item.apartment}-${item.sigungu}-${item.area}-${i}`}
                  style={{
                    backgroundColor: i % 2 === 1 ? 'var(--bg-secondary)' : undefined,
                  }}
                >
                  <td style={{
                    padding: 'var(--space-4)',
                    textAlign: 'center',
                    fontSize: 'var(--font-h3)',
                    fontWeight: 700,
                    color: 'var(--text-dim)',
                    borderBottom: '1px solid var(--border)',
                    width: '60px',
                  }}>
                    {i + 1}
                  </td>
                  <td style={{
                    padding: 'var(--space-4)',
                    fontSize: 'var(--font-h3)',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    borderBottom: '1px solid var(--border)',
                    overflowWrap: 'break-word',
                  }}>
                    {item.apartment}
                  </td>
                  <td style={{
                    padding: 'var(--space-4)',
                    fontSize: 'var(--font-sm)',
                    color: 'var(--text-muted)',
                    borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                  }}>
                    {item.sigungu} {item.region}
                  </td>
                  <td style={{
                    padding: 'var(--space-4)',
                    fontSize: 'var(--font-sm)',
                    color: 'var(--text-muted)',
                    textAlign: 'right',
                    borderBottom: '1px solid var(--border)',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}>
                    {formatArea(item.area)}
                  </td>
                  <td style={{
                    padding: 'var(--space-4)',
                    textAlign: 'right',
                    borderBottom: '1px solid var(--border)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    <span style={{
                      fontSize: 'var(--font-body-lg)',
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                    }}>
                      {formatKoreanPrice(item.newPrice)}
                    </span>
                    <br />
                    <span style={{
                      fontSize: 'var(--font-xs)',
                      color: 'var(--text-dim)',
                    }}>
                      이전 {formatKoreanPrice(item.prevHigh)}
                    </span>
                  </td>
                  <td style={{
                    padding: 'var(--space-4)',
                    textAlign: 'right',
                    fontSize: 'var(--font-body-lg)',
                    fontWeight: 600,
                    color: 'var(--success)',
                    borderBottom: '1px solid var(--border)',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}>
                    {formatPercent(item.increase)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards (< 768px) */}
      <div className="report-mobile">
        {items.map((item, i) => (
          <div
            key={`${item.apartment}-${item.sigungu}-${item.area}-${i}`}
            style={{
              backgroundColor: 'var(--bg-card)',
              borderLeft: '4px solid var(--success)',
              border: '1px solid var(--border)',
              borderLeftWidth: '4px',
              borderLeftColor: 'var(--success)',
              borderRadius: '12px',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-3)',
              overflowWrap: 'break-word',
            }}
          >
            {/* Header: rank + apartment */}
            <p style={{
              fontSize: 'var(--font-sm)',
              fontWeight: 700,
              color: 'var(--text-dim)',
            }}>
              #{i + 1}
            </p>
            <p style={{
              fontSize: 'var(--font-h3)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginTop: 'var(--space-2)',
              lineHeight: 'var(--line-snug)',
            }}>
              {item.apartment}
            </p>

            {/* Meta: region + area */}
            <p style={{
              fontSize: 'var(--font-sm)',
              color: 'var(--text-muted)',
              marginTop: 'var(--space-1)',
            }}>
              {item.sigungu} {item.region} · {formatArea(item.area)}
            </p>

            {/* Footer: price + increase */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginTop: 'var(--space-3)',
            }}>
              <p style={{
                fontSize: 'var(--font-body)',
                color: 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {formatKoreanPrice(item.prevHigh)} → {formatKoreanPrice(item.newPrice)}
              </p>
              <p style={{
                fontSize: 'var(--font-h3)',
                fontWeight: 700,
                color: 'var(--success)',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
                marginLeft: 'var(--space-3)',
              }}>
                {formatPercent(item.increase)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
