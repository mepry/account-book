/**
 * 달력 칸 테스트: 달마다 높이가 바뀌지 않도록 항상 6주(42칸)인지.
 */
import { buildWeeks, calendarRange } from '../src/lib/calendar';

test.each([
  ['2026-02', '4주로 딱 떨어지는 달 (일요일 시작, 28일)'],
  ['2026-08', '6주가 필요한 달 (토요일 시작, 31일)'],
  ['2026-11', '5주짜리 달'],
])('%s: %s도 6주', (ym) => {
  const weeks = buildWeeks(ym);
  expect(weeks).toHaveLength(6);
  expect(weeks.every((w) => w.length === 7)).toBe(true);
  // 첫 칸은 일요일, 해당 달 1일이 들어 있다
  expect(weeks.flat().some((c) => c.date === `${ym}-01` && c.inMonth)).toBe(true);
});

test('calendarRange는 6주 범위 전체', () => {
  expect(calendarRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-03-14' });
});
