/**
 * AdSense Placeholder Component — Phase 5c-7 Stage 2.6
 *
 * AdSense 계정 승인 대기 중이므로 placeholder만 렌더.
 * NEXT_PUBLIC_ADSENSE_CLIENT + slotId 둘 다 있을 때만 실제 광고 로드.
 */

interface AdSlotProps {
  type: 'article' | 'bottom';
  slotId?: string;
  label?: string;
}

export function AdSlot({ type, slotId, label = '광고' }: AdSlotProps) {
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

  return (
    <aside
      className="mx-auto max-w-5xl px-4 md:px-6 py-6"
      aria-label="광고 영역 (미설정)"
    >
      <div
        className="flex items-center justify-center min-h-[120px] md:min-h-[160px] border border-dashed rounded-lg text-sm"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-muted)',
        }}
      >
        <span>AdSlot · {type} · AdSense 승인 후 표시</span>
      </div>
    </aside>
  );
}
