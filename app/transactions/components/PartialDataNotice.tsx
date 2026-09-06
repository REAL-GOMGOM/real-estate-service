import type { TransactionCompleteness } from '@/lib/transaction-completeness';

export default function PartialDataNotice({
  coverage,
  empty,
  onRetry,
}: {
  coverage: TransactionCompleteness;
  empty: boolean;
  onRetry: () => void;
}) {
  return (
    <div style={{
      marginBottom: '16px', padding: '16px', borderRadius: '12px',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.7,
    }}>
      <div role="status">
        <p style={{ fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          일부 월 자료를 불러오지 못해 현재 목록과 건수는 부분 집계입니다.
        </p>
        {coverage.failedMonths.length > 0 && (
          <p style={{ margin: '0 0 4px', overflowWrap: 'anywhere' }}>
            누락된 월: {coverage.failedMonths.map((month) => `${month.slice(0, 4)}.${month.slice(4)}`).join(', ')}
          </p>
        )}
        <p style={{ margin: 0 }}>
          {empty
            ? '현재 확인 가능한 거래가 없습니다. 누락된 자료가 있어 이 기간에 거래가 없었다는 뜻은 아닙니다.'
            : '확인된 거래만 표시하며, 자료가 모두 모일 때까지 신고가·고점 대비 비교를 제공하지 않습니다.'}
        </p>
      </div>
      <button type="button" onClick={onRetry} style={{
        marginTop: '10px', padding: '9px 14px', borderRadius: '8px',
        background: 'var(--accent)', color: '#fff', border: 'none',
        fontSize: '13px', fontWeight: 700, cursor: 'pointer',
      }}>
        누락 자료 다시 조회
      </button>
    </div>
  );
}
