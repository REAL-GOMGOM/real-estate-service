'use client';

import Link from 'next/link';

export default function AptDetailError({ reset }: { reset: () => void }) {
  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', padding: '120px 24px 64px' }}>
      <div style={{
        maxWidth: '560px', margin: '0 auto', padding: '36px 28px', textAlign: 'center',
        borderRadius: '18px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
      }}>
        <h1 style={{ margin: '0 0 12px', fontSize: '22px', color: 'var(--text-primary)' }}>
          단지 상세를 잠시 불러오지 못했습니다
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-muted)' }}>
          실거래 조회는 계속 이용할 수 있습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0, borderRadius: '10px', padding: '10px 16px', cursor: 'pointer',
              backgroundColor: 'var(--accent)', color: '#fff', fontSize: '13px', fontWeight: 700,
            }}
          >
            다시 시도
          </button>
          <Link
            href="/transactions"
            style={{
              borderRadius: '10px', padding: '10px 16px', textDecoration: 'none',
              border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700,
            }}
          >
            실거래 조회로 이동
          </Link>
        </div>
      </div>
    </main>
  );
}
