/**
 * 월 달력 칸 계산 (화면과 무관한 순수 함수, 테스트용으로 분리).
 */
import { lastDayOfMonth, parseYmd, ymd } from './date';

export interface Cell {
  date: string;
  day: number;
  inMonth: boolean;
  weekday: number;
}

/**
 * 달력 칸을 만든다. 달마다 높이가 바뀌지 않게 항상 6주(42칸)로, 앞뒤 달 날짜로 채운다.
 * @param ym YYYY-MM
 */
export function buildWeeks(ym: string): Cell[][] {
  const { year, month } = parseYmd(`${ym}-01`);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const days = lastDayOfMonth(year, month);
  const cells: Cell[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    const d = new Date(year, month - 1, i - firstWeekday + 1);
    cells.push({ date: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()), day: d.getDate(), inMonth: false, weekday: i });
  }
  for (let day = 1; day <= days; day++) {
    cells.push({ date: ymd(year, month, day), day, inMonth: true, weekday: cells.length % 7 });
  }
  let next = 1;
  while (cells.length < 42) {
    const d = new Date(year, month, next++);
    cells.push({ date: ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()), day: d.getDate(), inMonth: false, weekday: cells.length % 7 });
  }
  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * 달력에 보이는 첫 칸~마지막 칸 날짜 (앞뒤 달 포함).
 * @param ym YYYY-MM
 */
export function calendarRange(ym: string): { from: string; to: string } {
  const weeks = buildWeeks(ym);
  return { from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date };
}
