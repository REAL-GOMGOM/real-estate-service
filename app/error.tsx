'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'var(--bg-primary)', padding: '24px', textAlign: 'center',
    }}>
      <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '12px' }}>
        문제가 발생했습니다
      </h2>
      <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '400px' }}>
        일시적인 오류가 발생했습니다. 다시 시도해주세요.
      </p>
      <button
        onClick={reset}
        style={{
          padding: '12px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 600,
          backgroundColor: 'var(--accent)', color: '#FFFFFF', border: 'none', cursor: 'pointer',
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
