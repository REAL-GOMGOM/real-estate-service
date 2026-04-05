import { NextRequest, NextResponse } from 'next/server';
import { simulateLoan, LoanInput } from '@/lib/loan-calculator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      housePrice,
      deposit,
      income,
      existingDebtPayment,
      loanTerm,
      productId,
      isNewlywedFirstTime,
      isLocalHouse,
      isCapitalArea,
      exclusiveDiscount,
      stackableDiscounts,
      repaymentType,
    } = body;

    if (!housePrice || !income || !loanTerm || !productId) {
      return NextResponse.json(
        { error: '필수 입력값이 누락되었습니다 (housePrice, income, loanTerm, productId)' },
        { status: 400 }
      );
    }

    const input: LoanInput = {
      housePrice: Number(housePrice),
      deposit: Number(deposit ?? 0),
      income: Number(income),
      existingDebtPayment: Number(existingDebtPayment ?? 0),
      loanTerm: Number(loanTerm),
      productId: String(productId),
      isNewlywedFirstTime: Boolean(isNewlywedFirstTime ?? false),
      isLocalHouse: Boolean(isLocalHouse ?? false),
      isCapitalArea: Boolean(isCapitalArea ?? true),
      exclusiveDiscount: exclusiveDiscount ?? null,
      stackableDiscounts: Array.isArray(stackableDiscounts) ? stackableDiscounts : [],
      repaymentType: repaymentType === 'equal_principal' ? 'equal_principal' : 'equal_principal_interest',
    };

    const result = simulateLoan(input);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: '시뮬레이션 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
