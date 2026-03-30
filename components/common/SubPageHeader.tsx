'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface Props {
  parentLabel: string;
  parentHref: string;
}

export default function SubPageHeader({ parentLabel, parentHref }: Props) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <Link
        href={parentHref}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--accent)',
          textDecoration: 'none',
          padding: '6px 12px',
          borderRadius: '8px',
          backgroundColor: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)',
          transition: 'opacity 0.15s',
        }}
      >
        <ChevronLeft size={16} />
        {parentLabel}으로 돌아가기
      </Link>
    </div>
  );
}
