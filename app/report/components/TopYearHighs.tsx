import type { YearHigh } from '@/lib/report/types';
import { formatKoreanPrice, formatPercent } from '@/lib/report/format';

interface TopYearHighsProps {
  items: YearHigh[];
}

function formatArea(area: number): string {
  return `${Math.round(area)}㎡`;
}

export default function TopYearHighs({ items }: TopYearHighsProps) {
  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{
        fontSize: '20px',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: '16px',
      }}>
        1년 최고가 경신 TOP {items.length}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {items.map((item, i) => (
          <div
            key={`${item.apartment}-${item.sigungu}-${item.area}-${i}`}
            style={{
              padding: '16px 20px',
              borderRadius: '14px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {/* 왼쪽: 단지 정보 */}
            <div style={{ minWidth: '0', flex: '1 1 200px' }}>
              <p style={{
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '4px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {item.apartment}
              </p>
              <p style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
              }}>
                {item.sigungu} {item.region} · {formatArea(item.area)}
              </p>
            </div>

            {/* 오른쪽: 가격 + 상승률 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexShrink: 0,
            }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}>
                  {formatKoreanPrice(item.newPrice)}
                </p>
                <p style={{
                  fontSize: '12px',
                  color: 'var(--text-dim)',
                }}>
                  이전 {formatKoreanPrice(item.prevHigh)}
                </p>
              </div>
              <span style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: '8px',
                backgroundColor: 'var(--success-bg)',
                color: 'var(--success-text)',
                fontWeight: 700,
                fontSize: '14px',
                whiteSpace: 'nowrap',
              }}>
                {formatPercent(item.increase)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
