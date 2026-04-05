import { NextResponse } from 'next/server';

const FSS_API_KEY = process.env.FSS_API_KEY ?? '';
const FSS_BASE = 'https://finlife.fss.or.kr/finlifeapi/mortgageLoanProductsSearch.json';

/* ── Types ── */

interface FssBaseItem {
  fin_co_no: string;
  kor_co_nm: string;
  fin_prdt_nm: string;
  join_way: string;
  loan_inci_expn: string;
  erly_rpay_fee: string;
  dly_rate: string;
  loan_lmt: string;
}

interface FssOptionItem {
  fin_co_no: string;
  fin_prdt_cd: string;
  mrtg_type: string;
  mrtg_type_nm: string;
  rpay_type: string;
  rpay_type_nm: string;
  lend_rate_type: string;
  lend_rate_type_nm: string;
  lend_rate_min: number;
  lend_rate_max: number;
  lend_rate_avg: number;
}

interface RateRange {
  min: number;
  max: number;
  avg: number;
}

interface BankProduct {
  productName: string;
  joinWay: string;
  earlyRepayFee: string;
  fixed?: RateRange;
  variable?: RateRange;
  mixed?: RateRange;
}

interface BankGroup {
  bankName: string;
  products: BankProduct[];
}

interface Summary {
  fixedAvg: number;
  variableAvg: number;
  lowestFixed: { bank: string; rate: number } | null;
  lowestVariable: { bank: string; rate: number } | null;
}

/* ── Helpers ── */

function lendRateTypeKey(code: string): 'fixed' | 'variable' | 'mixed' {
  if (code === 'F') return 'fixed';
  if (code === 'M') return 'mixed';
  return 'variable'; // 'S' = 변동
}

function buildResponse(baseList: FssBaseItem[], optionList: FssOptionItem[]) {
  // base 정보를 fin_co_no + fin_prdt_nm 키로 매핑
  const baseMap = new Map<string, FssBaseItem>();
  for (const b of baseList) {
    baseMap.set(`${b.fin_co_no}::${b.fin_prdt_nm}`, b);
  }

  // 은행별 > 상품별 > 금리타입별 집계
  const bankMap = new Map<string, { bankName: string; productMap: Map<string, BankProduct> }>();

  for (const opt of optionList) {
    // 아파트 담보만
    if (opt.mrtg_type_nm && !opt.mrtg_type_nm.includes('아파트')) continue;
    // 분할상환만
    if (opt.rpay_type !== 'D') continue;

    const baseKey = `${opt.fin_co_no}::${opt.fin_prdt_cd}`;
    // fin_prdt_cd로 못 찾으면 fin_co_no의 첫 번째 base 사용
    let base: FssBaseItem | undefined;
    for (const [k, v] of baseMap) {
      if (k.startsWith(opt.fin_co_no)) { base = v; break; }
    }
    if (!base) continue;

    if (!bankMap.has(base.kor_co_nm)) {
      bankMap.set(base.kor_co_nm, { bankName: base.kor_co_nm, productMap: new Map() });
    }
    const bank = bankMap.get(base.kor_co_nm)!;

    const pKey = base.fin_prdt_nm;
    if (!bank.productMap.has(pKey)) {
      bank.productMap.set(pKey, {
        productName: base.fin_prdt_nm,
        joinWay: base.join_way ?? '',
        earlyRepayFee: base.erly_rpay_fee ?? '',
      });
    }
    const product = bank.productMap.get(pKey)!;

    const rateKey = lendRateTypeKey(opt.lend_rate_type);
    const existing = product[rateKey];
    const range: RateRange = {
      min: opt.lend_rate_min,
      max: opt.lend_rate_max,
      avg: opt.lend_rate_avg,
    };

    if (!existing || range.min < existing.min) {
      product[rateKey] = range;
    }
  }

  // 변환
  const banks: BankGroup[] = [];
  for (const [, bank] of bankMap) {
    banks.push({
      bankName: bank.bankName,
      products: Array.from(bank.productMap.values()),
    });
  }
  banks.sort((a, b) => a.bankName.localeCompare(b.bankName, 'ko'));

  // 요약
  let fixedSum = 0, fixedCnt = 0, varSum = 0, varCnt = 0;
  let lowestFixed: Summary['lowestFixed'] = null;
  let lowestVariable: Summary['lowestVariable'] = null;

  for (const bank of banks) {
    for (const p of bank.products) {
      if (p.fixed) {
        fixedSum += p.fixed.avg;
        fixedCnt++;
        if (!lowestFixed || p.fixed.min < lowestFixed.rate) {
          lowestFixed = { bank: bank.bankName, rate: p.fixed.min };
        }
      }
      if (p.variable) {
        varSum += p.variable.avg;
        varCnt++;
        if (!lowestVariable || p.variable.min < lowestVariable.rate) {
          lowestVariable = { bank: bank.bankName, rate: p.variable.min };
        }
      }
    }
  }

  const summary: Summary = {
    fixedAvg: fixedCnt > 0 ? Math.round((fixedSum / fixedCnt) * 100) / 100 : 0,
    variableAvg: varCnt > 0 ? Math.round((varSum / varCnt) * 100) / 100 : 0,
    lowestFixed,
    lowestVariable,
  };

  return {
    updatedAt: new Date().toISOString().slice(0, 10),
    banks,
    summary,
  };
}

/* ── Route ── */

export async function GET() {
  if (!FSS_API_KEY) {
    return NextResponse.json(
      { error: 'FSS API 키 미설정', banks: [], summary: null },
      { status: 500 }
    );
  }

  try {
    const url = `${FSS_BASE}?auth=${FSS_API_KEY}&topFinGrpNo=050000&pageNo=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: null, banks: [], message: '금감원 API 응답 오류입니다. 잠시 후 다시 확인해주세요.' },
        {
          status: 200,
          headers: { 'Cache-Control': 'public, s-maxage=300' },
        }
      );
    }

    const data = await res.json();
    const result = data?.result;

    if (!result || result.err_cd !== '000') {
      const msg = '금감원 서버에서 데이터를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.';
      return NextResponse.json(
        { error: null, banks: [], message: msg },
        {
          status: 200,
          headers: { 'Cache-Control': 'public, s-maxage=300' },
        }
      );
    }

    const baseList: FssBaseItem[] = result.baseList ?? [];
    const optionList: FssOptionItem[] = result.optionList ?? [];

    const body = buildResponse(baseList, optionList);

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800' },
    });
  } catch {
    return NextResponse.json(
      { error: null, banks: [], message: '금감원 API 점검 중입니다. 평일에 다시 확인해주세요.' },
      {
        status: 200,
        headers: { 'Cache-Control': 'public, s-maxage=300' },
      }
    );
  }
}
