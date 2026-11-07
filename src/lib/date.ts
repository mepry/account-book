/**
 * 날짜 문자열(YYYY-MM-DD) 유틸.
 */

/**
 * 숫자를 두 자리 문자열로 만든다.
 * @param n 숫자
 */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 해당 월의 마지막 날짜(일)를 구한다.
 * @param year 연도
 * @param month 월 (1~12)
 */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 연·월·일을 YYYY-MM-DD로 만든다.
 */
export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * YYYY-MM-DD를 숫자로 분해한다.
 * @param date 날짜 문자열
 */
export function parseYmd(date: string): { year: number; month: number; day: number } {
  const [y, m, d] = date.split('-').map((s) => parseInt(s, 10));
  return { year: y, month: m, day: d };
}

/**
 * 날짜에 개월 수를 더한다. 같은 날이 없으면 그 달의 말일로 맞춘다.
 * 예) 2026-01-31 + 1개월 → 2026-02-28
 * @param date 기준 날짜
 * @param months 더할 개월 수
 */
export function addMonthsClamped(date: string, months: number): string {
  const { year, month, day } = parseYmd(date);
  const total = year * 12 + (month - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return ymd(ny, nm, Math.min(day, lastDayOfMonth(ny, nm)));
}

/**
 * 오늘 날짜를 YYYY-MM-DD로 돌려준다 (기기 시간대 기준).
 */
export function today(): string {
  const d = new Date();
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * 현재 시각을 HH:MM으로 돌려준다.
 */
export function nowTime(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 검색어가 날짜처럼 생겼으면 date 컬럼용 LIKE 패턴으로 바꾼다. 아니면 null.
 * 예) "2026.11.4" → "2026-11-04", "11/4"·"11월 4일" → "%-11-04", "11월" → "%-11-%", "2026년 3월" → "2026-03-%"
 * @param q 검색어
 */
export function dateQueryToLike(q: string): string | null {
  const s = q.trim();
  let m = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*(?:[-./월]\s*(?:(\d{1,2})\s*일?)?)?$/.exec(s);
  if (m) {
    const [, y, mo, d] = m;
    return d ? `${y}-${pad2(+mo)}-${pad2(+d)}` : `${y}-${pad2(+mo)}-%`;
  }
  m = /^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/.exec(s);
  if (m) return `%-${pad2(+m[1])}-${pad2(+m[2])}`;
  m = /^(\d{1,2})\s*월$/.exec(s);
  if (m) return `%-${pad2(+m[1])}-%`;
  m = /^(\d{4})\s*년?$/.exec(s);
  if (m) return `${m[1]}-%`;
  return null;
}

/**
 * 일평균에 쓸 날 수. 지난 달은 그 달 전체, 이번 달은 1일~오늘, 미래 달은 0.
 * @param ym YYYY-MM
 * @param todayYmd 오늘 YYYY-MM-DD
 */
export function elapsedDays(ym: string, todayYmd: string): number {
  const thisYm = todayYmd.slice(0, 7);
  if (ym > thisYm) return 0;
  if (ym === thisYm) return parseYmd(todayYmd).day;
  const { year, month } = parseYmd(`${ym}-01`);
  return lastDayOfMonth(year, month);
}
