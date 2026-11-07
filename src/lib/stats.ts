/**
 * 통계용 간단한 계산 (평균·중간값, 내역 목록 정렬).
 */

export interface TitleRow {
  name: string;
  total: number;
  count: number;
}

export type TitleSortKey = 'name' | 'count' | 'total';

export interface TitleSort {
  key: TitleSortKey;
  /** true = 많은순(금액·건수) / 가나다순(내역) */
  desc: boolean;
}

/** 헤더를 처음 눌렀을 때 방향: 금액·건수는 많은순, 내역은 가나다순 */
export const DEFAULT_SORT: TitleSort = { key: 'total', desc: true };

/**
 * 헤더를 눌렀을 때 다음 정렬. 같은 헤더면 방향을 뒤집고, 다른 헤더면 그 열 기본 방향.
 * @param cur 지금 정렬
 * @param key 누른 헤더
 */
export function nextSort(cur: TitleSort, key: TitleSortKey): TitleSort {
  return cur.key === key ? { key, desc: !cur.desc } : { key, desc: true };
}

/**
 * 내역 목록을 정렬한다. 동점이면 금액 많은순 → 이름 가나다순.
 * @param rows 내역별 합계
 * @param sort 정렬 기준
 */
export function sortTitleTotals<T extends TitleRow>(rows: readonly T[], sort: TitleSort): T[] {
  const byName = (a: T, b: T): number => a.name.localeCompare(b.name, 'ko');
  const primary = (a: T, b: T): number => {
    if (sort.key === 'name') return sort.desc ? byName(a, b) : byName(b, a);
    const d = a[sort.key] - b[sort.key];
    return sort.desc ? -d : d;
  };
  return [...rows].sort((a, b) => primary(a, b) || b.total - a.total || byName(a, b));
}

/**
 * 내역 이름 뒤에 상세를 괄호로 붙인다. 예) ("뮤지컬", "시카고, 스위니토드") → "뮤지컬(시카고, 스위니토드)"
 * @param title 내역
 * @param detail 상세 (비어 있으면 내역만)
 */
export function titleWithDetail(title: string, detail?: string | null): string {
  const d = detail?.trim();
  return d ? `${title}(${d})` : title;
}

/**
 * 평균 (원 단위 반올림). 빈 목록이면 0.
 * @param values 값 목록
 */
export function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

/**
 * 중간값 (짝수 개면 가운데 두 값의 평균, 원 단위 반올림). 빈 목록이면 0.
 * @param values 값 목록
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
