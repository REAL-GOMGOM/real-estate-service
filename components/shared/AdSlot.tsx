/**
 * AdSense Placeholder Component — Phase 5c-7 Stage 2.6
 *
 * AdSense 계정 승인 대기 중에는 placeholder 대신 자체 광고 문의 CTA를 렌더.
 * (사이클 W — "승인 후 표시" 문구가 방문자에게 그대로 노출되던 문제 해소)
 * NEXT_PUBLIC_ADSENSE_CLIENT + slotId 둘 다 있을 때만 실제 광고 로드.
 */
import Link from 'next/link';

interface AdSlotProps {
  type: 'article' | 'bottom';
  slotId?: string;
  label?: string;
}

export function AdSlot({ type: _type, slotId, label = '광고' }: AdSlotProps) {
  const publisherId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const isProduction = process.env.NODE_ENV === 'production';
  const hasAdSense = Boolean(publisherId && slotId);

  if (isProduction && hasAdSense) {
    return (
      <div className="mx-auto max-w-5xl px-4 md:px-6 py-6">
        <div className="text-xs text-center mb-2" style={{ color: 'var(--text-muted)' }}>
          {label}
        </div>
        <ins
          className="adsbygoogle block"
          style={{ display: 'block' }}
          data-ad-client={publisherId}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  // AdSense 미승인 상태 — 자체 광고 문의 CTA (빈 placeholder 노출 방지)
  return (
    <aside
      className="mx-auto max-w-5xl px-4 md:px-6 py-6"
      aria-label="광고 문의 영역"
    >
      <div
        className="relative flex flex-col items-center justify-center gap-3 min-h-[120px] md:min-h-[150px] rounded-2xl px-6 py-8 text-center overflow-hidden"
        style={{ backgroundColor: 'var(--ink, #14213D)' }}
      >
        <span
          className="absolute top-3 right-4 text-[10px] font-semibold tracking-wider"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          AD
        </span>
        <p className="text-base md:text-lg font-bold" style={{ color: '#FFFFFF' }}>
          이 자리에 광고, 어떠세요?
        </p>
        <p className="text-xs md:text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
          부동산 관심 독자에게 정확히 닿는 지면 · 분양·중개·금융 광고 추천
        </p>
        <Link
          href="/contact"
          className="mt-1 rounded-full px-5 py-2 text-sm font-bold transition-opacity hover:opacity-85"
          style={{ backgroundColor: '#FFFFFF', color: 'var(--ink, #14213D)' }}
        >
          광고 문의하기
        </Link>
      </div>
    </aside>
  );
}
