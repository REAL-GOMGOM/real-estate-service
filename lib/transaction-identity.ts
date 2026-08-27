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

function isBuildingDescriptor(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  return /^\d{1,4}동(?:[~\-–]\d{1,4}동)?$/.test(compact)
    || /^\d{1,4}동(?:[,/]\d{1,4}동)+$/.test(compact);
}

/**
 * 거래 카드 그룹용 보수적 정규화.
 *
 * (101동)처럼 같은 단지를 건물별로 쪼개는 표기만 제거하고, (주공1),
 * (대우), (효성)처럼 실제 단지를 구분하는 내용은 반드시 보존한다.
 */
export function normalizeTransactionGroupName(raw: string): string {
  if (typeof raw !== 'string') return '';
  const original = raw.trim();
  let value = original.replace(/（/g, '(').replace(/）/g, ')');

  value = value.replace(/\s*\(([^)]*)\)/g, (match, inner: string) => {
    const normalizedInner = String(inner).replace(/\s+/g, ' ').trim();
    if (isBuildingDescriptor(normalizedInner)) return '';
    return normalizedInner ? `(${normalizedInner})` : match;
  });
  value = value.replace(/\s*\d{1,4}동\s*[~\-–]\s*\d{1,4}동$/, '');
  value = value.replace(/\s*\d{1,4}동\s*[~\-–]?$/, '');
  value = value.replace(/\s+/g, ' ').trim();

  return value || original;
}

function normalizedIdentityName(value: string): string {
  return normalizeTransactionGroupName(value)
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function identityNameVariants(value: string, dong?: string | null): Set<string> {
  const normalized = normalizedIdentityName(value);
  if (!normalized) return new Set();

  const variants = new Set<string>();
  const queue = [normalized];
  const dongPrefix = normalizedIdentityName(dong ?? '');

  while (queue.length > 0) {
    const candidate = queue.shift()!;
    if (!candidate || variants.has(candidate)) continue;
    variants.add(candidate);

    // K-apt 등록명에만 붙는 법정동 접두사: 중동은하마을... -> 은하마을...
    if (dongPrefix && candidate.startsWith(dongPrefix)
      && candidate.length > dongPrefix.length) {
      queue.push(candidate.slice(dongPrefix.length));
    }

    // 소스별 차수 표기 차이: 주공1단지 / 주공1차 / 주공1.
    const withoutOrdinalSuffix = candidate.replace(/(\d+)(?:단지|차)$/, '$1');
    if (withoutOrdinalSuffix !== candidate) queue.push(withoutOrdinalSuffix);

    // 등록명에만 흔히 붙는 일반 접미사도 후보로만 제거한다.
    const withoutApartmentSuffix = candidate.replace(/아파트$/, '');
    if (withoutApartmentSuffix !== candidate) queue.push(withoutApartmentSuffix);
  }

  return variants;
}

function identityNames(apartment: ApartmentIdentity): Set<string> {
  const names = new Set<string>();
  for (const value of [apartment.name, ...(apartment.aliases ?? [])]) {
    for (const candidate of identityNameVariants(value, apartment.dong)) names.add(candidate);
  }
  return names;
}

function transactionNames(transaction: TransactionIdentity): Set<string> {
  return identityNameVariants(transaction.aptName, transaction.dong);
}

function namesOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

/** 같은 이름의 서로 다른 법정동 단지를 한 카드로 합치지 않는 안정적인 키. */
export function transactionGroupKey(aptName: string, dong?: string | null): string {
  return `${normalizeTransactionGroupName(aptName)}\u0000${normalizeDong(dong)}`;
}

/** 자동완성에서 선택한 단지 ID와 거래 행이 같은 단지인지 보수적으로 판정한다. */
export function matchesApartmentIdentity(
  transaction: TransactionIdentity,
  apartment: ApartmentIdentity,
): boolean {
  if (transaction.masterId) return transaction.masterId === apartment.id;

  if (!namesOverlap(identityNames(apartment), transactionNames(transaction))) {
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
export function findApartmentIdentity<T extends ApartmentIdentity>(
  transaction: TransactionIdentity,
  apartments: readonly T[],
): T | null {
  if (transaction.masterId) {
    return apartments.find((apartment) => apartment.id === transaction.masterId) ?? null;
  }

  const normalizedNames = transactionNames(transaction);
  const nameMatches = apartments.filter((apartment) =>
    namesOverlap(identityNames(apartment), normalizedNames),
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
