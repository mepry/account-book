/**
 * 새 할부 입력 분할 규칙 테스트.
 */
import { addMonthsClamped } from '../src/lib/date';
import { splitInstallment } from '../src/lib/installment';

test('floor(총액/n), 나머지는 1회차', () => {
  const parts = splitInstallment(1190869, 24, '2025-01-28');
  expect(parts).toHaveLength(24);
  expect(parts[0]).toEqual({ seq: 1, date: '2025-01-28', amount: 49632 });
  expect(parts.slice(1).every((p) => p.amount === 49619)).toBe(true);
  expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(1190869);
});

test('1/31 구매: 그 날이 없는 달은 말일 (평년 2/28, 윤년 2/29)', () => {
  expect(splitInstallment(100000, 3, '2026-01-31').map((p) => p.date)).toEqual([
    '2026-01-31',
    '2026-02-28',
    '2026-03-31',
  ]);
  expect(splitInstallment(100000, 2, '2028-01-31').map((p) => p.date)).toEqual(['2028-01-31', '2028-02-29']);
});

test('연도 넘김', () => {
  expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28');
  expect(splitInstallment(10, 3, '2026-12-15').map((p) => [p.date, p.amount])).toEqual([
    ['2026-12-15', 4],
    ['2027-01-15', 3],
    ['2027-02-15', 3],
  ]);
});

test('개월 수가 2 미만이면 오류', () => {
  expect(() => splitInstallment(1000, 1, '2026-01-01')).toThrow();
});
