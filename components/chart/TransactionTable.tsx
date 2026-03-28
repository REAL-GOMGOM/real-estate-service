'use client';

interface Transaction {
  id?: string;
  area: number;
  floor: number;
  price: number;
  pricePerArea: number;
  date: string;
}

interface Props {
  transactions: Transaction[];
}

function formatPrice(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}

export default function TransactionTable({ transactions }: Props) {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{
      borderRadius: '16px',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 60px 100px 100px',
        padding: '12px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: 'rgba(255,255,255,0.02)',
      }}>
        {['거래일', '면적', '층', '거래가', '㎡당'].map((h) => (
          <span key={h} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)' }}>{h}</span>
        ))}
      </div>

      {/* 목록 */}
      <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
        {sorted.map((tx, idx) => (
          <div
            key={idx}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 60px 100px 100px',
              padding: '12px 20px',
              borderBottom: idx < sorted.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{tx.date}</span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {Math.floor(tx.area * 0.3025)}평/{tx.area}㎡
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{tx.floor}층</span>
            <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: 'var(--text-primary)' }}>
              {formatPrice(tx.price)}
            </span>
            <span style={{ fontSize: '12px', fontFamily: 'Roboto Mono, monospace', color: 'var(--text-dim)' }}>
              {tx.pricePerArea.toLocaleString()}만
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}