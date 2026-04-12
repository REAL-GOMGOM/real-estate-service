import type { YearHigh } from '@/lib/report/types';
import { formatKoreanPrice, formatPercent } from '@/lib/report/format';

interface NotableDealsProps {
  deals: YearHigh[];
  threshold: number;
}

function formatArea(area: number): string {
  return `${area.toFixed(2)}㎡`;
}

export default function NotableDeals({ deals, threshold }: NotableDealsProps) {
  if (deals.length === 0) return null;

  const pct = Math.round(threshold * 100);

  return (
    <section style={{
      maxWidth: 'var(--container-narrow)',
      margin: '0 auto',
      padding: 'var(--space-7) var(--page-padding)',
    }}>
      {/* Header */}
      <p style={{
        fontSize: 'var(--font-sm)',
        color: 'var(--text-dim)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        fontWeight: 500,
        marginBottom: 'var(--space-2)',
      }}>
        특이 거래
      </p>
      <h2 style={{
        fontSize: 'var(--font-h1)',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: 'var(--space-3)',
      }}>
        눈여겨볼 거래
      </h2>
      <p style={{
        fontSize: 'var(--font-body)',
        color: 'var(--text-muted)',
        lineHeight: 'var(--line-normal)',
        marginBottom: 'var(--space-6)',
      }}>
        최근 30일간 {pct}% 이상 상승한 거래가 {deals.length}건 발견됐습니다.
        재건축, 리모델링, 또는 면적·층 차이로 인한 특수 사례일 가능성이 있어 별도로 분류했습니다.
      </p>

      {/* Deals list */}
      {deals.map((deal, i) => (
        <article
          key={`${deal.apartment}-${deal.sigungu}-${deal.area}-${i}`}
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderLeft: '4px solid var(--accent)',
            borderRadius: '12px',
            padding: 'var(--space-5)',
            marginBottom: 'var(--space-3)',
            overflowWrap: 'break-word',
          }}
        >
          {/* Header row */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 'var(--space-3)',
          }}>
            <p style={{
              fontSize: 'var(--font-h3)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              lineHeight: 'var(--line-snug)',
            }}>
              {deal.apartment}
            </p>
            <p style={{
              fontSize: 'var(--font-h3)',
              fontWeight: 700,
              color: 'var(--accent)',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {formatPercent(deal.increase)}
            </p>
          </div>

          {/* Meta line */}
          <p style={{
            fontSize: 'var(--font-sm)',
            color: 'var(--text-muted)',
            marginTop: 'var(--space-1)',
          }}>
            {deal.sido} {deal.sigungu} · {formatArea(deal.area)}
          </p>

          {/* Price line */}
          <p style={{
            fontSize: 'var(--font-body)',
            color: 'var(--text-muted)',
            marginTop: 'var(--space-2)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatKoreanPrice(deal.prevHigh)} → {formatKoreanPrice(deal.newPrice)}
          </p>
        </article>
      ))}
    </section>
  );
}
