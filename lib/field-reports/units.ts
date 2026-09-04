const SQUARE_METERS_PER_PYEONG = 3.305785;

const PYEONG_INPUT_PATTERN = /^\d{1,3}(?:\.\d)?$/;
const EOK_INPUT_PATTERN = /^\d{1,3}(?:\.\d{1,2})?$/;

/** Parse the new display unit while preserving the stored square-metre contract. */
export function pyeongToSquareMeters(value: string): number | null {
  if (!PYEONG_INPUT_PATTERN.test(value)) return null;
  const area = Math.round(Number(value) * SQUARE_METERS_PER_PYEONG * 100) / 100;
  return area >= 10 && area <= 500 ? area : null;
}

/** Parse 억원 without floating-point multiplication; stored prices remain integer 만원. */
export function eokToManwon(value: string, allowZero: boolean): number | null {
  const match = EOK_INPUT_PATTERN.exec(value);
  if (!match) return null;
  const [whole, fraction = ''] = value.split('.');
  const price = Number(whole) * 10_000 + Number(fraction.padEnd(4, '0'));
  if (!Number.isSafeInteger(price) || price > 5_000_000 || price < (allowZero ? 0 : 1)) return null;
  return price;
}

export function squareMetersToPyeong(area: number): number {
  return Math.round((area / SQUARE_METERS_PER_PYEONG) * 10) / 10;
}
