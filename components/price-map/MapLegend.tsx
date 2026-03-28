'use client';

const LEGEND_ITEMS = [
  { label: '-1.5%↓', color: '#1E40AF' },
  { label: '-0.5%',  color: '#60A5FA' },
  { label: '-0.1%',  color: '#93C5FD' },
  { label: '보합',   color: 'var(--text-muted)' },
  { label: '+0.1%',  color: '#FCA5A5' },
  { label: '+0.5%',  color: '#F87171' },
  { label: '+1.5%↑', color: '#DC2626' },
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
