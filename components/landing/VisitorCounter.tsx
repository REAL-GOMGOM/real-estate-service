'use client';

import { useEffect, useState } from 'react';
import { Users, Eye } from 'lucide-react';

export default function VisitorCounter() {
  const [data, setData] = useState<{ today: number; total: number } | null>(null);

  useEffect(() => {
    fetch('/api/visitors')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '20px',
      padding: '12px 24px', borderRadius: '12px',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Eye size={14} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>오늘</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>
          {data.today.toLocaleString()}
        </span>
      </div>
      <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Users size={14} style={{ color: 'var(--success)' }} />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>누적</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>
          {data.total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
