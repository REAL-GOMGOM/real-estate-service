import type { RegionDetail } from '@/lib/types';
import {
  buildRegionTransactionsHref,
  resolveRegionTransactionDistrict,
} from '@/lib/region-transactions-link';
import { RegionTransactionsLink } from './RegionTransactionsLink';

interface Props {
  region: RegionDetail;
}

function getScoreLevel(score: number): { label: string; color: string } {
  if (score < 2.0) return { label: '자체 기준 최상위', color: 'var(--accent)' };
  if (score < 2.5) return { label: '자체 기준 상위', color: 'var(--accent)' };
  if (score < 3.0) return { label: '자체 기준 중상위', color: 'var(--text-primary)' };
  if (score < 3.5) return { label: '자체 기준 중위', color: 'var(--text-muted)' };
  return { label: '자체 기준 중하위', color: 'var(--text-muted)' };
}

export function RegionHero({ region }: Props) {
  const level = getScoreLevel(region.score);
  const transactionsHref = buildRegionTransactionsHref(region);
  const hasResolvedDistrict = resolveRegionTransactionDistrict(region) !== null;

  return (
    <section className="mx-auto max-w-5xl px-4 md:px-6 py-8 md:py-12">
      <div className="space-y-4">
        {/* 상단 메타 */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span style={{ color: 'var(--text-muted)' }}>{region.region}</span>
          <span
            className="px-2 py-0.5 rounded-md text-xs font-medium"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: level.color }}
          >
            {level.label}
          </span>
          {region.isToheo && (
            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-800">
              토지거래허가구역
              {region.toheoUntil && ` (~${region.toheoUntil})`}
            </span>
          )}
        </div>

        {/* 메인 타이틀 */}
        <h1
          className="text-4xl md:text-5xl font-bold leading-tight"
          style={{ color: 'var(--text-strong)' }}
        >
          {region.name} 입지 지표
        </h1>

        {/* 점수·트렌드 */}
        <div className="flex items-baseline gap-4 pt-2">
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              자체 입지 점수 (1.00~5.00)
            </div>
            <div className="text-4xl font-bold" style={{ color: 'var(--accent)' }}>
              {region.score.toFixed(2)}
            </div>
          </div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            낮을수록 상위 · 등록 표본 상대평가
          </div>
        </div>

        {region.specialNote && (
          <p className="text-sm pt-2" style={{ color: 'var(--text-muted)' }}>
            데이터셋 메모: {region.specialNote}
          </p>
        )}

        <div className="pt-3">
          <RegionTransactionsLink
            href={transactionsHref}
            ariaLabel={hasResolvedDistrict
              ? `${region.name} 실거래 보기`
              : `${region.name} 실거래 지역 선택하기`}
            regionId={region.id}
            placement="hero"
            className="inline-flex min-h-12 items-center justify-center rounded-xl px-5 py-3 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              backgroundColor: 'var(--accent)',
              color: '#FFFFFF',
              '--tw-ring-color': 'var(--accent)',
            } as React.CSSProperties}
          >
            {hasResolvedDistrict ? '이 지역 실거래 보기' : '지역 선택 후 실거래 보기'} →
          </RegionTransactionsLink>
        </div>
      </div>
    </section>
  );
}
