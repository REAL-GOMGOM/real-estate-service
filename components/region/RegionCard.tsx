import Link from 'next/link';
import { BRAND } from '@/lib/design-tokens';

export interface RegionCardProps {
  name: string;
  score: number;
  rank?: number;
  href?: string;
  isHighlight?: boolean;
  subLabel?: string;
}

export function RegionCard({
  name,
  score,
  rank,
  href,
  isHighlight = false,
  subLabel,
}: RegionCardProps) {
  const accentColor = isHighlight ? BRAND.terracotta : BRAND.sage;
  const progressWidth = Math.max(100 - score * 30, 20);

  const content = (
    <div
      className="flex items-center gap-4 rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{
        backgroundColor: '#FFFFFF',
        border: isHighlight
          ? `2px solid ${BRAND.terracotta}`
          : `1px solid ${BRAND.line}`,
      }}
    >
      {rank !== undefined && (
        <div
          className="flex items-center justify-center w-12 h-12 rounded-xl text-base font-bold shrink-0"
          style={{
            backgroundColor: isHighlight ? BRAND.terracotta : BRAND.paper,
            color: isHighlight ? '#FFFFFF' : BRAND.inkSoft,
          }}
        >
          {rank}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <span className="text-base font-semibold" style={{ color: BRAND.ink }}>
          {name}
        </span>
        <span className="block text-xs" style={{ color: BRAND.inkSoft }}>
          {subLabel ?? '입지점수'}
        </span>
      </div>

      <div
        className="hidden md:block h-2 rounded-full overflow-hidden shrink-0"
        style={{ width: '120px', backgroundColor: `${accentColor}15` }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${progressWidth}%`,
            backgroundColor: accentColor,
          }}
        />
      </div>

      <span
        className="text-xl font-bold shrink-0"
        style={{
          color: isHighlight ? BRAND.terracotta : BRAND.ink,
          fontVariantNumeric: 'tabular-nums',
          minWidth: '48px',
          textAlign: 'right',
        }}
      >
        {score.toFixed(1)}
      </span>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded-2xl"
        style={{ '--tw-ring-color': BRAND.terracotta } as React.CSSProperties}
        aria-label={`${name} 입지 분석 보기, 점수 ${score.toFixed(1)}`}
      >
        {content}
      </Link>
    );
  }

  return content;
}
