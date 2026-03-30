'use client';

import Link from 'next/link';
import { Home, BarChart2, DollarSign, FileText, Newspaper } from 'lucide-react';

const NAV_BUTTONS = [
  { icon: Home, label: '홈', href: '/' },
  { icon: BarChart2, label: '차트', href: '/chart' },
  { icon: DollarSign, label: '실거래', href: '/transactions' },
  { icon: FileText, label: '갭분석', href: '/gap-analysis' },
  { icon: Newspaper, label: '뉴스', href: '/news' },
];

export default function FloatingNavPanel() {
  return (
    <div style={{
      position: 'absolute',
      right: '16px',
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 40,
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      padding: '8px',
      borderRadius: '14px',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
    }}>
      {NAV_BUTTONS.map(({ icon: Icon, label, href }) => (
        <Link
          key={href}
          href={href}
          title={label}
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            transition: 'background-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-overlay)';
            e.currentTarget.style.color = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <Icon size={20} />
        </Link>
      ))}
    </div>
  );
}
