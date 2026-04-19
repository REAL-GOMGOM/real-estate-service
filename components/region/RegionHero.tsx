import type { RegionDetail } from '@/lib/types';

interface Props {
  region: RegionDetail;
}

function getScoreLevel(score: number): { label: string; color: string } {
  if (score < 2.0) return { label: '최상급지', color: 'var(--accent)' };
  if (score < 2.5) return { label: '상급지', color: 'var(--accent)' };
  if (score < 3.0) return { label: '중상급지', color: 'var(--text-primary)' };
  if (score < 3.5) return { label: '중급지', color: 'var(--text-muted)' };
  return { label: '중하급지', color: 'var(--text-muted)' };
}

function getTrendLabel(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up') return '↑ 상승';
  if (trend === 'down') return '↓ 하락';
  return '→ 보합';
}

export function RegionHero({ region }: Props) {
  const level = getScoreLevel(region.score);

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
          {region.name} 입지 분석
        </h1>

        {/* 점수·트렌드 */}
        <div className="flex items-baseline gap-4 pt-2">
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              입지 점수
            </div>
            <div className="text-4xl font-bold" style={{ color: 'var(--accent)' }}>
              {region.score.toFixed(2)}
            </div>
          </div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {getTrendLabel(region.trend)}
            {region.prevScore != null && ` · 이전 ${region.prevScore.toFixed(2)}`}
          </div>
        </div>

        {region.specialNote && (
          <p className="text-sm pt-2" style={{ color: 'var(--text-muted)' }}>
            * {region.specialNote}
          </p>
        )}
      </div>
    </section>
  );
}
