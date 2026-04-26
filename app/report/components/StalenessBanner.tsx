import './staleness-banner.css';

interface Props {
  /** 리포트 대상 기간의 마지막 날짜 (YYYY-MM-DD) */
  dateRangeTo: string;
  /** 리포트 생성 시각 (ISO) */
  generatedAt: string;
}

function formatRelativeKorean(dateStr: string): string {
  const target = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - target.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 1) return '오늘';
  if (diffDays === 1) return '1일 전';
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  return `${Math.floor(diffDays / 30)}개월 전`;
}

export default function StalenessBanner({ dateRangeTo, generatedAt }: Props) {
  const relative = formatRelativeKorean(dateRangeTo);
  const generatedDate = new Date(generatedAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="staleness-banner" role="status" aria-live="polite">
      <div className="staleness-banner__inner">
        <span className="staleness-banner__icon" aria-hidden="true">⚠️</span>
        <div className="staleness-banner__text">
          <strong>리포트 갱신 지연 안내</strong>
          <span>
            현재 표시된 리포트는 <b>{relative}</b> 데이터입니다 (생성: {generatedDate}).
            데이터 소스 점검 중이며 곧 정상화됩니다.
          </span>
        </div>
      </div>
    </div>
  );
}
