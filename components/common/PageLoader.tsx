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
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timer);
  }, [loading, delay]);

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
