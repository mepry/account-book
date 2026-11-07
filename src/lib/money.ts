/**
 * 원화 금액 표기 유틸.
 */

/**
 * 천 단위 콤마를 넣는다. 예) 12500 → "12,500"
 * @param n 금액
 */
export function formatNumber(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.abs(Math.trunc(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 원화 표기. 예) 12500 → "12,500원"
 * @param n 금액
 */
export function formatWon(n: number): string {
  return `${formatNumber(n)}원`;
}

/**
 * 입력 문자열에서 숫자만 뽑아 금액으로 만든다. 예) "12,500" → 12500
 * @param text 입력값
 */
export function parseAmount(text: string): number {
  const digits = text.replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}
