import type { RegionStats } from '@/lib/report/types';

interface RegionTableProps {
  byRegion: RegionStats[];
}

function formatKoreanPrice(won: number): string {
  const uk = Math.floor(won / 100_000_000);
  const man = Math.round((won % 100_000_000) / 10_000);
  if (uk > 0 && man > 0) return `${uk.toLocaleString()}억 ${man.toLocaleString()}만원`;
  if (uk > 0) return `${uk.toLocaleString()}억`;
  if (man > 0) return `${man.toLocaleString()}만원`;
  return '0원';
}

export default function RegionTable({ byRegion }: RegionTableProps) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <h2 style={{
        fontSize: '20px',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: '16px',
      }}>
        시도별 현황
      </h2>

      {/* 데스크톱 테이블 */}
      <div style={{
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-card)',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '15px',
        }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              {['시도', '거래수', '1년 최고가 경신', '평균가'].map((col) => (
                <th
                  key={col}
                  style={{
                    padding: '14px 16px',
                    textAlign: col === '시도' ? 'left' : 'right',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byRegion.map((r, i) => (
              <tr
                key={r.sido}
                style={{
                  borderTop: i > 0 ? '1px solid var(--border-light)' : undefined,
                }}
              >
                <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {r.sido}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-primary)' }}>
                  {r.deals.toLocaleString()}건
                </td>
                <td style={{
                  padding: '14px 16px',
                  textAlign: 'right',
                  color: 'var(--success-text)',
                  fontWeight: 600,
                }}>
                  {r.yearHighs.toLocaleString()}건
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-primary)' }}>
                  {formatKoreanPrice(r.avgPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
