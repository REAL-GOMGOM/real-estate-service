import type { RegionDetail } from '@/lib/types';

interface Props {
  region: RegionDetail;
}

const confidenceLabels: Record<'H' | 'M' | 'L', { label: string; desc: string }> = {
  H: { label: '직접 지표 비중 높음', desc: '공개 통계와 직접 수록값 중심' },
  M: { label: '혼합', desc: '공개자료와 단지별 보조 추정 혼합' },
  L: { label: '참조', desc: '유사 지역의 간접·대체 지표 비중 높음' },
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
            데이터 완결도(자체 분류):
          </span>
          <span>
            {conf.label} — {conf.desc}
          </span>
        </div>
        <div className="space-y-2 pt-2 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          <p>
            원자료 연구표는 국토교통부 실거래가 공개시스템, 한국부동산원·KOSIS 공개 통계,
            KB부동산 및 민간 단지 자료를 함께 참조했습니다. KB와 민간 자료는 정부 공식
            통계가 아니며, 일부 지역 값은 직접 관측값이 아닌 추정치입니다.
          </p>
          <p>
            자체 점수는 등록 지역 표본에서 평당가 25% + 2025년 매매 변동 20% + 교통 20%
            + 학군 15% + 산업 10% + 공급 10%를 전국 z-score로 표준화해 가중합한 뒤,
            sigmoid 함수로 1.00~5.00에 매핑합니다. 낮을수록 해당 표본 안에서 상대적으로
            상위이며, 공인 감정가·투자등급·미래 수익률 예측이 아닙니다.
          </p>
          <p>
            기준 월은 데이터셋 버전 기준입니다. 지표별 실제 관측일과 갱신 주기는 서로
            다를 수 있으므로 지역 간 탐색용 참고값으로 사용하세요.
          </p>
        </div>
      </div>
    </section>
  );
}
