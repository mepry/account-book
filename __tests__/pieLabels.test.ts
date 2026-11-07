/**
 * 원형 차트 캡션 배치 테스트: 퍼센트 반올림, 0% 포함, 같은 쪽 캡션끼리 안 겹치는지.
 */
import { hitTestPie, layoutPieLabels, toSlices } from '../src/lib/pieLabels';

test('퍼센트는 정수 반올림, 합계 0이면 모두 0%', () => {
  expect(toSlices([2, 1, 0]).map((s) => s.percent)).toEqual([67, 33, 0]);
  expect(toSlices([0, 0]).map((s) => s.percent)).toEqual([0, 0]);
});

test('캡션이 같은 쪽에서 겹치지 않고, 0% 캡션은 적은 쪽으로 간다', () => {
  const H = 32;
  const slices = toSlices([500, 300, 100, 50, 30, 10, 5, 3, 2, 0, 0, 0, 0, 0]);
  const labels = layoutPieLabels(slices, 100, H);
  expect(labels).toHaveLength(slices.length);
  for (const side of ['left', 'right'] as const) {
    const ys = labels.filter((l) => l.side === side).map((l) => l.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(H - 1e-9);
  }
  const left = labels.filter((l) => l.side === 'left').length;
  const right = labels.length - left;
  expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
  expect(labels.every((l) => Number.isFinite(l.y))).toBe(true);
});

test('조각 하나뿐이어도 캡션 위치가 나온다', () => {
  const [l] = layoutPieLabels(toSlices([100]), 100, 32);
  expect(Number.isFinite(l.y)).toBe(true);
});

test('hitTestPie: 가운데는 center, 링은 각도에 맞는 조각, 밖은 null', () => {
  // 12시부터 시계 방향: 0번 50%(오른쪽 반), 1번 0%, 2번 25%(왼쪽 아래), 3번 25%(왼쪽 위)
  const slices = toSlices([500, 0, 250, 250]);
  expect(hitTestPie(slices, 0, 0, 40, 100)).toBe('center');
  expect(hitTestPie(slices, 10, -10, 40, 100)).toBe('center');
  expect(hitTestPie(slices, 70, 0, 40, 100)).toBe(0); // 3시
  expect(hitTestPie(slices, -50, 50, 40, 100)).toBe(2); // 7시 반
  expect(hitTestPie(slices, -50, -50, 40, 100)).toBe(3); // 10시 반
  expect(hitTestPie(slices, 0, -70, 40, 100)).toBe(0); // 12시 바로 → 첫 조각
  expect(hitTestPie(slices, 101, 0, 40, 100)).toBeNull();
  expect(hitTestPie(toSlices([0, 0]), 70, 0, 40, 100)).toBeNull();
});
