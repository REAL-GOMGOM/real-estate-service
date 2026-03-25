export default function Loading() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0A0E1A', paddingTop: '64px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px' }}>
        {/* 헤더 스켈레톤 */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ width: '320px', height: '34px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: '10px' }} />
          <div style={{ width: '200px', height: '16px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.04)' }} />
        </div>
        {/* 배너 스켈레톤 */}
        <div style={{ height: '72px', borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: '24px' }} />
        {/* 검색 스켈레톤 */}
        <div style={{ height: '56px', borderRadius: '14px', backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: '24px' }} />
        {/* 테이블 스켈레톤 */}
        <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: '56px', backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
