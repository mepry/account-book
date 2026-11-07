/**
 * 할부 분할 계산.
 * 규칙: 금액 = floor(총액 / n), 나머지는 1회차에 더한다.
 *       1회차 = 구매일, 이후 매월 같은 날 (그 날이 없으면 말일).
 */
import { addMonthsClamped } from './date';

export interface InstallmentPart {
  seq: number;
  date: string;
  amount: number;
}

/**
 * 할부 총액을 회차별로 나눈다.
 * @param total 총액 (원)
 * @param months 할부 개월 수 (2~24)
 * @param purchaseDate 구매일 YYYY-MM-DD
 * @returns 회차별 날짜·금액
 */
export function splitInstallment(total: number, months: number, purchaseDate: string): InstallmentPart[] {
  if (!Number.isInteger(months) || months < 2) throw new Error(`할부 개월 수가 잘못됨: ${months}`);
  const base = Math.floor(total / months);
  const remainder = total - base * months;
  return Array.from({ length: months }, (_, i) => ({
    seq: i + 1,
    date: addMonthsClamped(purchaseDate, i),
    amount: i === 0 ? base + remainder : base,
  }));
}
