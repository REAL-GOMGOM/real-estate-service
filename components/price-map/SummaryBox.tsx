'use client';

interface SummaryBoxProps {
  period: string;
  nationwide: number;
  capitalArea: number;
  nonCapital: number;
}

export default function SummaryBox({ period, nationwide, capitalArea, nonCapital }: SummaryBoxProps) {
  const items = [
    { label: '전국', value: nationwide },
    { label: '수도권', value: capitalArea },
    { label: '지방', value: nonCapital },
  ];

  return (
    <div style={{
      padding: '16px 20px', borderRadius: '14px',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border)',
      marginBottom: '20px',
    }}>
      <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '12px' }}>{period}</p>
      <div style={{ display: 'flex', gap: '24px' }}>
        {items.map((item) => (
          <div key={item.label}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{item.label}</p>
            <p style={{
              fontSize: '20px', fontWeight: 700,
              fontFamily: 'Roboto Mono, monospace',
              color: item.value >= 0 ? '#F87171' : '#60A5FA',
            }}>
              {item.value >= 0 ? '+' : ''}{item.value.toFixed(2)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
