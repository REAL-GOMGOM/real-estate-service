import dynamic from 'next/dynamic';
import type { RegionDetail } from '@/lib/types';

const ScoreRadarChart = dynamic(
  () =>
    import('./charts/ScoreRadarChart').then((m) => ({
      default: m.ScoreRadarChart,
    })),
  { loading: () => <div style={{ minHeight: 320 }} /> },
);

interface Props {
  region: RegionDetail;
}

export function RegionScoreBreakdown({ region }: Props) {
  const { metrics } = region;

  return (
    <section
      className="mx-auto max-w-5xl px-4 md:px-6 py-8 md:py-10 border-t"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2
        className="text-xl md:text-2xl font-semibold mb-2"
        style={{ color: 'var(--text-strong)' }}
      >
        지표별 점수
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        교통·학군·산업·공급 4개 지표를 10점 만점으로 비교합니다.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center">
        <div>
          <ScoreRadarChart metrics={metrics} />
        </div>

        <dl className="space-y-2 text-sm">
          {[
            { label: '교통', value: metrics.transport },
            { label: '학군', value: metrics.school },
            { label: '산업', value: metrics.industry },
            { label: '공급', value: metrics.supply },
          ].map((item) => (
            <div
              key={item.label}
              className="flex justify-between py-1.5 border-b last:border-0"
              style={{ borderColor: 'var(--border)' }}
            >
              <dt style={{ color: 'var(--text-muted)' }}>{item.label}</dt>
              <dd
                className="font-medium"
                style={{
                  color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {(item.value ?? 0).toFixed(1)} / 10
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
