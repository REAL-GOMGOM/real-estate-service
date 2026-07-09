'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

/**
 * 모바일 내비 — 랜딩 상단 햄버거 메뉴.
 * 데스크톱은 CSS(.naezip-mobilenav display:none)로 숨기고, ≤720px 에서만 노출.
 * 링크/닫기 탭 시 닫힘.
 */

const LINKS = [
  { label: '부동산 분석', href: '/region' },
  { label: '청약', href: '/subscription' },
  { label: '내집마련 도구', href: '/loan' },
  { label: '시장 동향', href: '/market' },
  { label: '칼럼', href: '/blog' },
  { label: '뉴스', href: '/news' },
  { label: '로그인', href: '/admin/login' },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="naezip-mobilenav" style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="메뉴"
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 40, height: 40, borderRadius: 10, border: '1px solid #E7EAF0',
          background: '#FFFFFF', color: '#0B1524', cursor: 'pointer',
        }}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0, zIndex: 60,
          minWidth: 200, background: '#FFFFFF', border: '1px solid #E7EAF0',
          borderRadius: 14, boxShadow: '0 20px 50px -24px rgba(15,30,60,0.4)',
          padding: 8, display: 'flex', flexDirection: 'column',
        }}>
          {LINKS.map((l) => (
            <Link
              key={l.href + l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              style={{
                padding: '11px 14px', borderRadius: 9, fontSize: 15, fontWeight: 600,
                color: '#3A4453', textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
