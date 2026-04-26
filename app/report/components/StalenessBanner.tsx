import './staleness-banner.css';

interface Props {
  /** 리포트 종료일과 현재 시각의 차이(일) — 부모에서 계산해서 전달 */
  diffDays: number;
  /** 리포트가 다루는 마지막 날짜 (사용자 표시용) */
  dateRangeTo: string;
}

/**
 * 리포트가 오래된 경우 사용자에게 표시하는 배너.
 *
 * PPR 호환을 위해 시간 계산은 부모(ReportContent)에서 처리.
 * 이 컴포넌트는 순수 UI — 정적 prerender 가능.
 */
export default function StalenessBanner({ diffDays, dateRangeTo }: Props) {
  const days = Math.floor(diffDays);

  let relative: string;
  if (days < 1) relative = '오늘';
  else if (days === 1) relative = '1일 전';
  else if (days < 7) relative = `${days}일 전`;
  else if (days < 30) relative = `${Math.floor(days / 7)}주 전`;
  else relative = `${Math.floor(days / 30)}개월 전`;

  return (
    <div className="staleness-banner" role="status" aria-live="polite">
      <div className="staleness-banner__inner">
        <span className="staleness-banner__icon" aria-hidden="true">⚠️</span>
        <div className="staleness-banner__text">
          <strong>리포트 갱신 지연 안내</strong>
          <span>
            현재 표시된 리포트는 <b>{relative}</b> 데이터입니다 ({dateRangeTo} 기준).
            데이터 소스 점검 중이며 곧 정상화됩니다.
          </span>
        </div>
      </div>
    </div>
  );
}
