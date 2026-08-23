import type { RegionDetail } from '@/lib/types';

function formatSignedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}
/**
 * 검수되지 않은 생성형 문장 대신 구조화 지표에서만 만드는 중립 설명.
 * 지표의 개별 관측일이 없는 경우에는 데이터셋 기준월이라는 한계를 함께 밝힌다.
 */
export function buildRegionHeadline(region: RegionDetail): string {
  return `${region.name} 입지 지표 요약`;
}

export function buildRegionSummary(region: RegionDetail): string {
  const parts = [
    `${region.region} ${region.name}의 자체 입지 점수는 ${region.score.toFixed(2)}점입니다.`,
    '1.00에 가까울수록 등록 지역 표본 안에서 상대적으로 상위이며, 공인 감정가나 공식 지역 등급은 아닙니다.',
  ];

  if (region.metrics.pricePerPyeong != null) {
    parts.push(`데이터셋에 수록된 평당가는 ${region.metrics.pricePerPyeong.toLocaleString('ko-KR')}만원입니다.`);
  }
  if (region.metrics.annualChange2025 != null) {
    parts.push(`2025년 연간 매매 변동 수록값은 ${formatSignedPercent(region.metrics.annualChange2025)}입니다.`);
  }

  parts.push(`데이터셋 기준월은 ${region.month}이며, 지표별 실제 관측 시점은 서로 다를 수 있습니다.`);
  return parts.join(' ');
}
