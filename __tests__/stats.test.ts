/**
 * 통계 계산 테스트: 평균·중간값, 내역 목록 정렬.
 */
import { average, DEFAULT_SORT, median, nextSort, rankMonthCategories, sortTitleTotals } from '../src/lib/stats';

test('평균은 원 단위 반올림, 빈 목록은 0', () => {
  expect(average([100, 200, 0])).toBe(100);
  expect(average([1, 2])).toBe(2);
  expect(average([])).toBe(0);
});

test('중간값: 홀수 개는 가운데, 짝수 개는 가운데 두 값 평균', () => {
  expect(median([5, 1, 3])).toBe(3);
  expect(median([0, 0, 100, 300])).toBe(50);
  expect(median([])).toBe(0);
});

const rows = [
  { name: '다', total: 100, count: 1 },
  { name: '가', total: 300, count: 1 },
  { name: '나', total: 100, count: 5 },
];

test('헤더 정렬: 같은 헤더는 방향 토글, 다른 헤더는 많은순(가나다순)부터', () => {
  expect(DEFAULT_SORT).toEqual({ key: 'total', desc: true });
  expect(nextSort(DEFAULT_SORT, 'total')).toEqual({ key: 'total', desc: false });
  expect(nextSort(DEFAULT_SORT, 'count')).toEqual({ key: 'count', desc: true });
  expect(nextSort({ key: 'count', desc: false }, 'name')).toEqual({ key: 'name', desc: true });
});

test('금액·건수·내역 정렬과 동점 처리 (금액 많은순 → 가나다순)', () => {
  const names = (key: 'name' | 'count' | 'total', desc: boolean) => sortTitleTotals(rows, { key, desc }).map((r) => r.name);
  expect(names('total', true)).toEqual(['가', '나', '다']);
  expect(names('total', false)).toEqual(['나', '다', '가']);
  expect(names('count', true)).toEqual(['나', '가', '다']);
  expect(names('count', false)).toEqual(['가', '다', '나']);
  expect(names('name', true)).toEqual(['가', '나', '다']);
  expect(names('name', false)).toEqual(['다', '나', '가']);
});

test('달마다 카테고리 상위 3개 + etc', () => {
  const r = rankMonthCategories([
    { ym: '2026-10', name: '식비', total: 500 },
    { ym: '2026-10', name: '쇼핑', total: 300 },
    { ym: '2026-10', name: '교통', total: 100 },
    { ym: '2026-10', name: '문화', total: 200 },
    { ym: '2026-10', name: '기타', total: 50 },
    { ym: '2026-11', name: '식비', total: 100 },
    { ym: '2026-11', name: '공짜', total: 0 },
  ]);
  expect(r['2026-10']).toEqual({
    top: [
      { name: '식비', total: 500 },
      { name: '쇼핑', total: 300 },
      { name: '문화', total: 200 },
    ],
    etc: 150,
    total: 1150,
  });
  // 3개 이하면 etc 0, 0원 카테고리는 순위에서 빠짐
  expect(r['2026-11']).toEqual({ top: [{ name: '식비', total: 100 }], etc: 0, total: 100 });
});
