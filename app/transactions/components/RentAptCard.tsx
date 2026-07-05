'use client';

import { fmtPrice, fmtContractDate } from '../types';
import { type RentAptGroup, fmtRentPrice } from '@/lib/rent-shared';

/**
 * 전월세 단지 카드 — 사이클 II (전세·월세 탭 v1).
 *
 * 매매 AptCard 와 같은 그리드 톤. 최근 계약 헤드라인 + 최근 4건 미니 리스트.
 * 전월세 상세 모달·차트는 v2 백로그 — v1 은 카드 안에서 완결.
 */

export default function RentAptCard({ apt }: { apt: RentAptGroup }) {
  const latest = apt.transactions[0]; // 호출부(API)가 최신순 정렬
  if (!latest) return null;

  return (
    <article style={{
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '16px', padding: '18px',
    }}>
      {/* 단지명 · 위치 */}
      <p style={{
        margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>
        {apt.name}
      </p>
      <p style={{ margin: '3px 0 12px', fontSize: '12px', color: 'var(--text-dim)' }}>
        {apt.district}{apt.dong ? ` ${apt.dong}` : ''}
        {apt.buildYear ? ` · ${apt.buildYear}년` : ''}
        {' · '}{apt.transactions.length}건
      </p>

      {/* 최근 계약 헤드라인 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.4px', fontFamily: 'Roboto Mono, monospace' }}>
          {fmtRentPrice(latest, fmtPrice)}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
          {latest.area}㎡ · {latest.floor}층 · {fmtContractDate(latest.date)}
        </span>
      </div>

      {/* 최근 거래 미니 리스트 (최대 4건 — 최신 제외 다음 건부터) */}
      <div style={{ borderTop: '1px solid var(--border-light)' }}>
        {apt.transactions.slice(1, 5).map((tx, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 0', borderBottom: '1px solid var(--border-light)',
              fontSize: '12px', color: 'var(--text-muted)',
            }}
          >
            <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{fmtContractDate(tx.date)}</span>
            <span style={{ flexShrink: 0 }}>{tx.area}㎡ · {tx.floor}층</span>
            {tx.contractType && (
              <span style={{
                flexShrink: 0, fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '5px',
                backgroundColor: tx.contractType === '갱신' ? 'var(--border-light)' : '#EAF3FF',
                color: tx.contractType === '갱신' ? 'var(--text-dim)' : '#1B4DDB',
              }}>
                {tx.contractType}
              </span>
            )}
            <span style={{
              marginLeft: 'auto', fontWeight: 700, color: 'var(--text-primary)',
              fontFamily: 'Roboto Mono, monospace', whiteSpace: 'nowrap',
            }}>
              {fmtRentPrice(tx, fmtPrice)}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}
