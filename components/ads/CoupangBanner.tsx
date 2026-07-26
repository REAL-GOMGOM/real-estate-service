'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 쿠팡 파트너스 다이내믹 배너 (캐러셀 680×140, iframe 임베드) — 전역 푸터 상단 배치
 *
 * 정책 준수:
 * - 소재 원형 그대로 노출 (2026-06-08 커버형 배너 금지: 덮개 디자인·클릭 유도 문구 불가)
 * - 하단 대가성 고지 문구 필수 표기 (파트너스 규정)
 * - 팝업·전면 형태 금지 (애드센스 심사 "방해되는 광고" 리스크 회피)
 *
 * 모바일: 컨테이너 폭 기준 transform scale 축소 — 소재 변형이 아니라 크기 조정.
 */

const BANNER_ID = 987354;
const TRACKING_CODE = 'AF2740428';
const BASE_W = 680;
const BASE_H = 140;

interface CoupangBannerProps {
  /** footer: 전역 푸터 상단 (배경·보더) / inline: 콘텐츠 사이 인피드 (투명·컴팩트) */
  variant?: 'footer' | 'inline';
  /** 파트너스 성과 추적용 지면 식별자 (예: footer, blog-end, tx-feed) */
  subId?: string;
}

export default function CoupangBanner({ variant = 'footer', subId = '' }: CoupangBannerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / BASE_W));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div style={variant === 'footer' ? {
      backgroundColor: 'var(--bg-tertiary)',
      borderTop: '1px solid var(--border-light)',
      padding: '20px 24px 10px',
    } : {
      padding: '6px 0 2px',
    }}>
      <div ref={wrapRef} style={{ maxWidth: `${BASE_W}px`, margin: '0 auto' }}>
        <div style={{ height: `${Math.round(BASE_H * scale)}px`, overflow: 'hidden' }}>
          <iframe
            src={`https://ads-partners.coupang.com/widgets.html?id=${BANNER_ID}&template=carousel&trackingCode=${TRACKING_CODE}&subId=${encodeURIComponent(subId)}&width=${BASE_W}&height=${BASE_H}&tsource=`}
            width={BASE_W}
            height={BASE_H}
            frameBorder="0"
            scrolling="no"
            loading="lazy"
            referrerPolicy="unsafe-url"
            title="쿠팡 파트너스 광고"
            style={{ transform: `scale(${scale})`, transformOrigin: 'left top', display: 'block', border: 0 }}
          />
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', margin: '8px 0 0' }}>
          이 광고는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </p>
      </div>
    </div>
  );
}
