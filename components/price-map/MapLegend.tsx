'use client';

const LEGEND_ITEMS = [
  { label: '-1.5%↓', color: '#1636A8' },
  { label: '-0.5%',  color: 'var(--accent)' },
  { label: '-0.1%',  color: '#B9CBF5' },
  { label: '보합',   color: 'var(--text-muted)' },
  { label: '+0.1%',  color: '#F4B6B6' },
  { label: '+0.5%',  color: '#E85D5D' },
  { label: '+1.5%↑', color: '#C92F2F' },
];

export default function MapLegend() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginRight: '4px' }}>하락</span>
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <div style={{
            width: '32px', height: '14px', borderRadius: '3px',
            backgroundColor: item.color,
          }} />
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{item.label}</span>
        </div>
      ))}
      <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '4px' }}>상승</span>
    </div>
  );
}
