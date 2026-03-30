'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  message?: string;
  detail?: string;
  onRetry?: () => void;
  showMaintenanceHint?: boolean;
}

function isMaintenanceTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 1 && hour < 6;
}

export default function ErrorState({
  message = '데이터를 불러오지 못했습니다',
  detail,
  onRetry,
  showMaintenanceHint = true,
}: Props) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', gap: '12px',
      textAlign: 'center',
    }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '12px',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AlertTriangle size={24} style={{ color: '#EF4444' }} />
      </div>
      <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
        {message}
      </p>
      {detail && (
        <p style={{ fontSize: '13px', color: 'var(--text-dim)', maxWidth: '400px' }}>
          {detail}
        </p>
      )}
      {showMaintenanceHint && isMaintenanceTime() && (
        <p style={{
          fontSize: '12px', color: '#F59E0B',
          padding: '8px 16px', borderRadius: '8px',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          maxWidth: '400px',
        }}>
          현재 공공데이터 점검 시간(01:00~06:00)일 수 있습니다. 잠시 후 다시 시도해주세요.
        </p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '10px 20px', borderRadius: '10px',
            fontSize: '13px', fontWeight: 600,
            backgroundColor: 'var(--accent)', color: 'white',
            border: 'none', cursor: 'pointer',
            marginTop: '8px',
          }}
        >
          <RefreshCw size={14} />
          다시 시도
        </button>
      )}
    </div>
  );
}
