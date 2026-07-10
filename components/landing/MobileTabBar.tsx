import Link from 'next/link';
import { Home, Map, CalendarDays, Calculator, MoreHorizontal } from 'lucide-react';

/**
 * 모바일 하단 탭바 — 홈 대시보드 (2a 시안).
 * ≤720px 에서만 노출 (데스크톱은 CSS 로 숨김). 홈 탭 활성 고정 (랜딩 전용).
 */

const TABS = [
  { label: '홈',     href: '/',              Icon: Home,           active: true },
  { label: '지도',   href: '/location-map',  Icon: Map,            active: false },
  { label: '청약',   href: '/subscription',  Icon: CalendarDays,   active: false },
  { label: '도구',   href: '/loan',          Icon: Calculator,     active: false },
  { label: '더보기', href: '/market',        Icon: MoreHorizontal, active: false },
];

export default function MobileTabBar() {
  return (
    <nav className="nz-tabbar" aria-label="모바일 하단 메뉴">
      <style>{`
        .nz-tabbar{display:none}
        @media (max-width:720px){
          .nz-tabbar{
            display:flex;align-items:center;justify-content:space-around;
            position:fixed;left:0;right:0;bottom:0;z-index:90;
            padding:10px 10px calc(10px + env(safe-area-inset-bottom));
            border-top:1px solid #EEF0F5;background:#FFFFFF;
          }
        }
      `}</style>
      {TABS.map(({ label, href, Icon, active }) => (
        <Link
          key={href}
          href={href}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            textDecoration: 'none', minWidth: 52,
          }}
        >
          <Icon size={21} color={active ? '#1B4DDB' : '#98A1B0'} />
          <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 600, color: active ? '#1B4DDB' : '#98A1B0' }}>
            {label}
          </span>
        </Link>
      ))}
    </nav>
  );
}
