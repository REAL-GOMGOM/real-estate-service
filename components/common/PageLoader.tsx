'use client';

import { useState, useEffect } from 'react';

interface Props {
  loading: boolean;
  message?: string;
  delay?: number;
}

export default function PageLoader({
  loading,
  message = '데이터를 불러오는 중...',
  delay = 800,
}: Props) {
  // delay 경과 여부만 state 로 두고, 표시 여부는 loading 과의 파생값으로 계산
  const [delayPassed, setDelayPassed] = useState(false);

  // loading 이 바뀌면 경과 플래그 초기화 (렌더 중 이전 값 비교 패턴)
  const [prevLoading, setPrevLoading] = useState(loading);
  if (prevLoading !== loading) {
    setPrevLoading(loading);
    setDelayPassed(false);
  }

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setDelayPassed(true), delay);
    return () => clearTimeout(timer);
  }, [loading, delay]);

  const show = loading && delayPassed;

  if (!show) return null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', gap: '16px',
    }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '50%',
        border: '3px solid var(--border)',
        borderTopColor: 'var(--accent)',
        animation: 'page-loader-spin 0.8s linear infinite',
      }} />
      <p style={{ fontSize: '14px', color: 'var(--text-dim)', fontWeight: 500 }}>
        {message}
      </p>
      <style>{`@keyframes page-loader-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
