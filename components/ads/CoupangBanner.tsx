'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useConsent } from '@/hooks/useConsent';
import { shouldShowFooterCoupang } from '@/lib/marketing-routes';

const BANNER_ID = 987354;
const TRACKING_CODE = 'AF2740428';
const BASE_W = 680;
const BASE_H = 140;

interface CoupangBannerProps {
  /** footer: 전역 푸터 상단 / inline: 콘텐츠 사이 인피드 */
  variant?: 'footer' | 'inline';
  /** 파트너스 성과 추적용 지면 식별자 */
  subId?: string;
}

export default function CoupangBanner({ variant = 'footer', subId = '' }: CoupangBannerProps) {
  const pathname = usePathname();
  const consent = useConsent();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const enabled = consent?.advertising === true && (
    variant === 'inline' || shouldShowFooterCoupang(pathname)
  );

  useEffect(() => {
    if (!enabled) return;
    const element = wrapRef.current;
    if (!element) return;

    const update = () => setScale(Math.min(1, element.clientWidth / BASE_W));
    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);

  if (!enabled) return null;

  return (
    <aside
      aria-label="쿠팡 파트너스 제휴 광고"
      style={variant === 'footer' ? {
        backgroundColor: 'var(--bg-tertiary)',
        borderTop: '1px solid var(--border-light)',
        padding: '20px 24px 10px',
      } : {
        padding: '8px 0 4px',
      }}
    >
      <div style={{ maxWidth: `${BASE_W}px`, margin: '0 auto' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textAlign: 'center', margin: '0 0 6px' }}>
          제휴 광고 · 쿠팡 파트너스
        </p>
        <div
          ref={wrapRef}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: `${BASE_W} / ${BASE_H}`,
            overflow: 'hidden',
          }}
        >
          {scale !== null && (
            <iframe
              src={`https://ads-partners.coupang.com/widgets.html?id=${BANNER_ID}&template=carousel&trackingCode=${TRACKING_CODE}&subId=${encodeURIComponent(subId)}&width=${BASE_W}&height=${BASE_H}&tsource=`}
              width={BASE_W}
              height={BASE_H}
              frameBorder="0"
              scrolling="no"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              title="쿠팡 파트너스 상품 광고"
              style={{
                position: 'absolute',
                inset: 0,
                transform: `scale(${scale})`,
                transformOrigin: 'left top',
                display: 'block',
                border: 0,
              }}
            />
          )}
        </div>
        <p style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-dim)', textAlign: 'center', margin: '8px 0 0' }}>
          이 광고는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </p>
      </div>
    </aside>
  );
}
