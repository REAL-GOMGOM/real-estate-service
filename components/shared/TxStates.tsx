'use client';

/**
 * 실거래 조회 상태 컴포넌트 — 사이클 X (최종 디자인 10b·10c 시안)
 *
 * TxErrorState: 경고 아이콘 + "다시 시도" CTA
 * TxEmptyState: 돋보기 아이콘 + "필터 초기화" 아웃라인 버튼
 */

interface TxErrorStateProps {
  onRetry: () => void;
}

export function TxErrorState({ onRetry }: TxErrorStateProps) {
  return (
    <div
      role="alert"
      style={{
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '16px', padding: '48px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center',
      }}
    >
      <div style={{
        width: '88px', height: '88px', borderRadius: '24px',
        backgroundColor: '#FDECEC',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '20px',
      }}>
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#E23B3B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4" /><path d="M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
        데이터를 불러오지 못했어요
      </div>
      <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '22px' }}>
        국토부 실거래 서버 응답이 지연되고<br />있습니다. 잠시 후 다시 시도해주세요.
      </div>
      <button
        onClick={onRetry}
        style={{
          border: 0, backgroundColor: 'var(--accent)', color: '#FFFFFF',
          fontWeight: 700, fontSize: '13.5px', padding: '11px 24px',
          borderRadius: '11px', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: '7px',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
        </svg>
        다시 시도
      </button>
    </div>
  );
}

interface TxEmptyStateProps {
  onReset?: () => void;
}

export function TxEmptyState({ onReset }: TxEmptyStateProps) {
  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '16px', padding: '48px 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center',
      }}
    >
      <div style={{
        width: '88px', height: '88px', borderRadius: '24px',
        backgroundColor: '#EEF3FF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '20px',
      }}>
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
        </svg>
      </div>
      <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
        조건에 맞는 실거래가 없어요
      </div>
      <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: onReset ? '22px' : 0 }}>
        선택하신 지역·가격대에 최근 신고된<br />거래가 없습니다. 필터를 넓혀보세요.
      </div>
      {onReset && (
        <button
          onClick={onReset}
          style={{
            border: '1px solid #D6DEEC', backgroundColor: 'var(--bg-card)',
            color: 'var(--accent)', fontWeight: 700, fontSize: '13.5px',
            padding: '11px 20px', borderRadius: '11px', cursor: 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          필터 초기화
        </button>
      )}
    </div>
  );
}
