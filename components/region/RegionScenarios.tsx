import dynamic from 'next/dynamic';
import type { RegionDetail } from '@/lib/types';

const ScenarioBarChart = dynamic(
  () =>
    import('./charts/ScenarioBarChart').then((m) => ({
      default: m.ScenarioBarChart,
    })),
  { loading: () => <div style={{ minHeight: 320 }} /> },
);

interface Props {
  region: RegionDetail;
}

export function RegionScenarios({ region }: Props) {
  const { scenarios } = region;

  const sensitivity = scenarios.sensitivity ?? 0;
  const sensitivityLabel =
    sensitivity < 0.2
      ? '안정적 (가중치 변화에 둔감)'
      : sensitivity < 0.5
        ? '보통'
        : '민감 (가중치 변화에 크게 좌우)';

  return (
    <section
      className="mx-auto max-w-5xl px-4 md:px-6 py-8 md:py-10 border-t"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2
        className="text-xl md:text-2xl font-semibold mb-2"
        style={{ color: 'var(--text-strong)' }}
      >
        시나리오 민감도
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        평가 지표 가중치를 달리 했을 때 점수가 어떻게 변하는지 보여줍니다.
      </p>

      <ScenarioBarChart scenarios={scenarios} />

      <dl className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 text-sm">
        {[
          { label: '기본', value: scenarios.base },
          { label: '시세중심', value: scenarios.price },
          { label: '성장중심', value: scenarios.growth },
          { label: '인프라중심', value: scenarios.infra },
          { label: '변동폭', value: scenarios.sensitivity },
        ].map((item) => (
          <div
            key={item.label}
            className="p-3 rounded-md border"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border)',
            }}
          >
            <dt className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
              {item.label}
            </dt>
            <dd
              className="font-bold"
              style={{
                color: 'var(--text-strong)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {item.value != null ? item.value.toFixed(2) : '—'}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
        변동폭 {sensitivity.toFixed(2)} → <strong>{sensitivityLabel}</strong>
      </p>
    </section>
  );
}
