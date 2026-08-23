import { normalizeMLTMName } from '@/lib/normalize-mltm-name';

export interface ApartmentIdentity {
  id: string;
  name: string;
  aliases?: string[] | null;
  dong?: string | null;
}

export interface TransactionIdentity {
  aptName: string;
  dong?: string | null;
  masterId?: string | null;
}

function normalizeDong(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').trim();
}

function identityNames(apartment: ApartmentIdentity): Set<string> {
  return new Set(
    [apartment.name, ...(apartment.aliases ?? [])]
      .map((name) => normalizeMLTMName(name))
      .filter(Boolean),
  );
}

/** 같은 이름의 서로 다른 법정동 단지를 한 카드로 합치지 않는 안정적인 키. */
export function transactionGroupKey(aptName: string, dong?: string | null): string {
  return `${normalizeMLTMName(aptName)}\u0000${normalizeDong(dong)}`;
}

/** 자동완성에서 선택한 단지 ID와 거래 행이 같은 단지인지 보수적으로 판정한다. */
export function matchesApartmentIdentity(
  transaction: TransactionIdentity,
  apartment: ApartmentIdentity,
): boolean {
  if (transaction.masterId) return transaction.masterId === apartment.id;

  if (!identityNames(apartment).has(normalizeMLTMName(transaction.aptName))) {
    return false;
  }

  const apartmentDong = normalizeDong(apartment.dong);
  const transactionDong = normalizeDong(transaction.dong);
  if (apartmentDong) return transactionDong === apartmentDong;
  // 정확한 masterId도 법정동도 없으면 동명 단지를 구분할 근거가 없다.
  return false;
}

/**
 * 이름·별칭과 법정동이 모두 맞는 마스터를 우선한다. 동 정보가 부족한 경우에는
 * 이름 후보가 정확히 하나일 때만 연결해 동명 단지에 임의 ID를 붙이지 않는다.
 */
export function findApartmentIdentity(
  transaction: TransactionIdentity,
  apartments: ApartmentIdentity[],
): ApartmentIdentity | null {
  if (transaction.masterId) {
    return apartments.find((apartment) => apartment.id === transaction.masterId) ?? null;
  }

  const normalizedName = normalizeMLTMName(transaction.aptName);
  const nameMatches = apartments.filter((apartment) =>
    identityNames(apartment).has(normalizedName),
  );
  if (nameMatches.length === 0) return null;

  const transactionDong = normalizeDong(transaction.dong);
  if (transactionDong) {
    const exactDongMatches = nameMatches.filter(
      (apartment) => normalizeDong(apartment.dong) === transactionDong,
    );
    if (exactDongMatches.length === 1) return exactDongMatches[0];
    return null;
  }

  return nameMatches.length === 1 ? nameMatches[0] : null;
}
