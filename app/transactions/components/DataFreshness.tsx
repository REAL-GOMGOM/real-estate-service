import { transactionFreshnessLabel, type TransactionFreshnessResult } from '@/lib/transaction-freshness';

export default function DataFreshness({ result, requestKey }: {
  result?: TransactionFreshnessResult;
  requestKey: string;
}) {
  const current = result?.requestKey === requestKey ? result : undefined;
  const loading = !current || current.status === 'loading';
  const value = current?.status === 'ready' ? current.value : null;

  return (
    <span role="status" aria-label="데이터 갱신 정보" style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
      {loading ? '데이터 기준 시각 확인 중' : value ? (
        <time dateTime={value.at} title={value.kind === 'snapshot'
          ? '화면에 표시된 공개 스냅샷의 기준 시각입니다. 계약일·신고일과 다를 수 있습니다.'
          : '집계를 생성한 시각이며, 원본 거래의 수집 시각과는 다릅니다.'}>
          {transactionFreshnessLabel(value)}
        </time>
      ) : '데이터 기준 시각 확인 불가'}
    </span>
  );
}
