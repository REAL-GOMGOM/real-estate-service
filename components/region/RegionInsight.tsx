import type { RegionDetail } from '@/lib/types';
import { buildRegionHeadline, buildRegionSummary } from '@/lib/region-copy';

interface Props {
  region: RegionDetail;
}

export function RegionInsight({ region }: Props) {
  const headline = buildRegionHeadline(region);
  const summary = buildRegionSummary(region);

  return (
    <section
      className="mx-auto max-w-5xl px-4 md:px-6 py-8 md:py-10 border-t"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="space-y-4">
        <h2
          className="text-2xl md:text-3xl font-semibold leading-snug"
          style={{ color: 'var(--text-strong)' }}
        >
          {headline}
        </h2>

        <p
          className="text-base md:text-lg leading-relaxed"
          style={{ color: 'var(--text-primary)' }}
        >
          {summary}
        </p>

        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          기존 자동 생성 해설은 구조화 지표와 충돌할 수 있어 표시하지 않습니다.
          아래 원지표와 산식 설명을 함께 확인하세요.
        </p>
      </div>
    </section>
  );
}
