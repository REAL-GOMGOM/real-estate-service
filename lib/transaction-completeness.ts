export interface TransactionCompleteness {
  complete: boolean;
  failedMonths: string[];
}

export const COMPLETE_TRANSACTION_DATA: TransactionCompleteness = {
  complete: true,
  failedMonths: [],
};

/** Keep the records and their coverage together, including client cache restores. */
export function readTransactionCompleteness(body: {
  status?: unknown;
  failedMonths?: unknown;
}): TransactionCompleteness {
  const reportedMonths = Array.isArray(body.failedMonths) ? body.failedMonths : [];
  const failedMonths = [...new Set(reportedMonths.filter(
    (month): month is string => typeof month === 'string' && /^\d{4}(0[1-9]|1[0-2])$/.test(month),
  ))].sort().reverse().slice(0, 36);
  return {
    // Even malformed failure details must not turn a partial response into complete data.
    complete: body.status !== 'partial' && reportedMonths.length === 0,
    failedMonths,
  };
}
