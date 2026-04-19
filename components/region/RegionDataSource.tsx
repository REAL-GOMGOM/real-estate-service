import type { RegionDetail } from '@/lib/types';

interface Props {
  region: RegionDetail;
}

const confidenceLabels: Record<'H' | 'M' | 'L', { label: string; desc: string }> = {
  H: { label: '높음', desc: '한국부동산원·KB 등 1차 공식 자료 기반' },
  M: { label: '중간', desc: '호갱노노·zippoom 단지별 평균 추정' },
  L: { label: '참조', desc: '유사 등급 참조 간접 추정' },
};

export function RegionDataSource({ region }: Props) {
  const conf = confidenceLabels[region.metrics.confidence];

  return (
    <section
      className="mx-auto max-w-5xl px-4 md:px-6 py-8 md:py-10 border-t"
      style={{ borderColor: 'var(--border)' }}
    >
      <h2
        className="text-xl md:text-2xl font-semibold mb-4"
        style={{ color: 'var(--text-strong)' }}
      >
        데이터 출처
      </h2>

      <div className="space-y-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        <div className="flex gap-2">
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            기준 월:
          </span>
          <span>{region.month}</span>
        </div>
        <div className="flex gap-2">
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            데이터 신뢰도:
          </span>
          <span>
            {conf.label} — {conf.desc}
          </span>
        </div>
        <div className="pt-2 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          본 분석은 국토교통부 실거래가 공개시스템, 한국부동산원 주간 매매동향,
          KOSIS 통계, KB부동산 시세 등 공식 데이터를 기반으로 작성되었습니다.
          <br />
          점수는 전국 z-score 기반 가중합으로 산정되며, 낮을수록 상급지입니다.
        </div>
      </div>
    </section>
  );
}
