import { BRAND } from '@/lib/design-tokens';
import type { RegionDetail } from '@/lib/types';

interface Props {
  region: RegionDetail;
}

function formatKrwManwon(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${value.toLocaleString('ko-KR')}만원`;
}

function formatPercent(
  value: number | null | undefined,
  showSign = true,
): string {
  if (value === null || value === undefined) return '—';
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatPopulation(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('ko-KR')}`;
}

function getChangeColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'var(--text-muted)';
  if (value > 0) return 'var(--accent)';
  if (value < 0) return BRAND.danger;
  return 'var(--text-muted)';
}

function getPopulationColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'var(--text-muted)';
  if (value > 0) return BRAND.successText;
  if (value < 0) return BRAND.danger;
  return 'var(--text-muted)';
}

export function RegionMarketMetrics({ region }: Props) {
  const { metrics } = region;

  const cards = [
    {
      label: '평당가',
      value: formatKrwManwon(metrics.pricePerPyeong),
      sub: '만원/3.3㎡ · 기준 시점 혼합',
    },
    {
      label: '2025 연간 변동',
      value: formatPercent(metrics.annualChange2025),
      sub: '2025년 수록 누계값',
      color: getChangeColor(metrics.annualChange2025),
    },
    {
      label: '수록 주간 변동',
      value: formatPercent(metrics.weeklyChange2026),
      sub: '2026년 4월 연구표 수록값',
      color: getChangeColor(metrics.weeklyChange2026),
    },
    {
      label: '전세가율',
      value:
        metrics.jeonseRatio != null
          ? `${metrics.jeonseRatio.toFixed(1)}%`
          : '—',
      sub: 'KB 참조 · 세부 기준일 상이',
    },
    {
      label: '미분양',
      value:
        metrics.unsold != null
          ? `${metrics.unsold.toLocaleString('ko-KR')}`
          : '—',
      sub: '세대 · 세부 기준일 상이',
    },
    {
      label: '인구 순이동',
      value: formatPopulation(metrics.populationFlow),
      sub: '명/월 · 수록 월값',
      color: getPopulationColor(metrics.populationFlow),
    },
    {
      label: '거래량 변동',
      value: formatPercent(metrics.tradeVolumeChange),
      sub: '수록 전년 동기 대비값',
      color: getChangeColor(metrics.tradeVolumeChange),
    },
  ];

  return (
    <section
      className="mx-auto max-w-5xl px-4 md:px-6 py-8 md:py-10 border-t"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2
        className="text-xl md:text-2xl font-semibold mb-6"
        style={{ color: 'var(--text-strong)' }}
      >
        시세·변동률
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border)',
            }}
          >
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              {card.label}
            </div>
            <div
              className="text-lg md:text-xl font-bold"
              style={{
                color: card.color ?? 'var(--text-strong)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {card.value}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {card.sub}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
        데이터셋 버전 {region.month}. 카드별 실제 관측일과 출처 주기가 달라 현재 실시간
        시세로 해석할 수 없습니다. 최신 계약은 실거래 조회에서 별도로 확인하세요.
      </p>
    </section>
  );
}
