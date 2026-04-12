const block = (height: string, width = '100%'): React.CSSProperties => ({
  height,
  width,
  borderRadius: '10px',
  backgroundColor: 'var(--bg-tertiary)',
});

const card: React.CSSProperties = {
  padding: '20px',
  borderRadius: '14px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border)',
};

export default function ReportSkeleton() {
  return (
    <div style={{
      maxWidth: '960px',
      margin: '0 auto',
      padding: 'clamp(32px, 6vw, 64px) 24px',
    }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ ...block('32px', '70%'), marginBottom: '12px' }} />
        <div style={{ ...block('16px', '50%'), marginBottom: '8px' }} />
        <div style={block('14px', '30%')} />
      </div>

      {/* Summary cards skeleton */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={card}>
            <div style={{ ...block('14px', '60%'), marginBottom: '12px' }} />
            <div style={block('28px', '80%')} />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ ...block('20px', '120px'), marginBottom: '16px' }} />
        <div style={{ ...card, padding: '0', overflow: 'hidden' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                padding: '14px 16px',
                borderTop: i > 0 ? '1px solid var(--border-light)' : undefined,
              }}
            >
              <div style={block('16px', i === 0 ? '100%' : '90%')} />
            </div>
          ))}
        </div>
      </div>

      {/* Top list skeleton */}
      <div>
        <div style={{ ...block('20px', '200px'), marginBottom: '16px' }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ ...card, marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ ...block('16px', '160px'), marginBottom: '8px' }} />
              <div style={block('13px', '120px')} />
            </div>
            <div style={block('28px', '80px')} />
          </div>
        ))}
      </div>
    </div>
  );
}
