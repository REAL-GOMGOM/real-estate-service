interface SummaryProps {
  totalDeals: number;
  totalYearHighs: number;
  totalAmount: number;
  avgPrice: number;
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

const cardStyle: React.CSSProperties = {
  padding: '20px',
  borderRadius: '14px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border)',
};

export default function Summary({ totalDeals, totalYearHighs, totalAmount, avgPrice }: SummaryProps) {
  const cards = [
    { label: '총 거래수', value: `${totalDeals.toLocaleString()}건`, highlight: false },
    { label: '1년 최고가 경신', value: `${totalYearHighs.toLocaleString()}건`, highlight: true },
    { label: '총 거래액', value: formatKoreanPrice(totalAmount), highlight: false },
    { label: '평균 거래가', value: formatKoreanPrice(avgPrice), highlight: false },
  ];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
      gap: '16px',
      marginBottom: '32px',
    }}>
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            ...cardStyle,
            ...(card.highlight
              ? { backgroundColor: 'var(--success-bg)', borderColor: 'var(--success)' }
              : {}),
          }}
        >
          <p style={{
            fontSize: '13px',
            color: card.highlight ? 'var(--success-text)' : 'var(--text-muted)',
            marginBottom: '8px',
          }}>
            {card.label}
          </p>
          <p style={{
            fontSize: 'clamp(20px, 3vw, 28px)',
            fontWeight: 700,
            color: card.highlight ? 'var(--success-text)' : 'var(--text-primary)',
          }}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
