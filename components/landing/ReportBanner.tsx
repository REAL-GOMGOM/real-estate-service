'use client';

import Link from 'next/link';

export default function ReportBanner() {
  return (
    <section style={{
      maxWidth: 'var(--container-default)',
      margin: '0 auto',
      padding: 'var(--space-6) var(--page-padding)',
    }}>
      <Link
        href="/report"
        style={{ textDecoration: 'none', display: 'block' }}
      >
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderLeft: '6px solid var(--accent)',
            borderRadius: '16px',
            padding: 'clamp(24px, 4vw, 32px) clamp(24px, 5vw, 48px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--space-5)',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
          }}
        >
          {/* 텍스트 영역 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 'var(--font-xs)',
              fontWeight: 600,
              color: 'var(--accent)',
              marginBottom: 'var(--space-2)',
              letterSpacing: '0.03em',
            }}>
              NEW · 매주 월/수/금 업데이트
            </p>
            <p style={{
              fontSize: 'var(--font-h1)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              lineHeight: 'var(--line-tight)',
              marginBottom: 'var(--space-2)',
            }}>
              오늘의 수도권 아파트 실거래 리포트
            </p>
            <p style={{
              fontSize: 'var(--font-body)',
              color: 'var(--text-muted)',
              lineHeight: 'var(--line-normal)',
            }}>
              AI가 분석한 신고가 동향 · 최근 30일 데이터
            </p>
          </div>

          {/* CTA */}
          <span style={{
            fontSize: 'var(--font-h2)',
            color: 'var(--accent)',
            flexShrink: 0,
            transition: 'transform 0.2s',
          }}>
            →
          </span>
        </div>
      </Link>
    </section>
  );
}
