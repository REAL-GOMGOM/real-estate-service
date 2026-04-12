import { DISTRICT_CODE } from '@/lib/district-codes';
import type { Sido } from './types';

interface SudogwonDistrict {
  name: string;
  code: string;
  sido: Sido;
}

const PREFIX_SIDO: Record<string, Sido> = {
  '11': '서울',
  '41': '경기',
  '28': '인천',
};

export function getSudogwonDistricts(): SudogwonDistrict[] {
  return Object.entries(DISTRICT_CODE)
    .filter(([, code]) => {
      const prefix = code.slice(0, 2);
      return prefix in PREFIX_SIDO;
    })
    .map(([name, code]) => ({
      name,
      code,
      sido: PREFIX_SIDO[code.slice(0, 2)],
    }));
}
