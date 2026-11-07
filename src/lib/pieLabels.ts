/**
 * 원형 차트 캡션 배치 계산 (화면과 무관한 순수 함수).
 * 각 조각의 가운데 각도에 맞춰 차트 좌우에 캡션을 놓고, 같은 쪽 캡션끼리 겹치지 않게 위아래로 민다.
 * 좌표는 차트 중심을 (0, 0)으로, 오른쪽이 +x, 아래쪽이 +y.
 */

export interface PieSlice {
  /** 시작 비율 (0~1, 12시 방향부터 시계 방향) */
  start: number;
  /** 비율 (0~1) */
  fraction: number;
  /** 화면 표시용 퍼센트 (정수, 반올림) */
  percent: number;
}

export interface PieLabel {
  side: 'left' | 'right';
  /** 캡션 세로 가운데 y */
  y: number;
  /** 지시선 시작점 (조각 바깥 테두리) */
  anchorX: number;
  anchorY: number;
}

/**
 * 금액 목록을 조각(시작·비율·퍼센트)으로 바꾼다. 합계가 0이면 모두 0%.
 * @param values 금액 목록
 */
export function toSlices(values: readonly number[]): PieSlice[] {
  const total = values.reduce((s, v) => s + v, 0);
  let acc = 0;
  return values.map((v) => {
    const fraction = total > 0 ? v / total : 0;
    const slice = { start: acc, fraction, percent: Math.round(fraction * 100) };
    acc += fraction;
    return slice;
  });
}

/**
 * 도넛 차트에서 누른 위치가 어디인지 찾는다.
 * @param slices toSlices 결과
 * @param dx 차트 중심 기준 x (오른쪽 +)
 * @param dy 차트 중심 기준 y (아래쪽 +)
 * @param inner 가운데 빈 원 반지름
 * @param outer 차트 바깥 반지름
 * @returns 'center'(가운데 빈 원), 조각 index, 또는 null(차트 밖이나 0% 조각)
 */
export function hitTestPie(
  slices: readonly PieSlice[],
  dx: number,
  dy: number,
  inner: number,
  outer: number,
): number | 'center' | null {
  const dist = Math.hypot(dx, dy);
  if (dist < inner) return 'center';
  if (dist > outer) return null;
  // 12시 방향 0, 시계 방향으로 증가하는 비율 (0~1)
  let angle = Math.atan2(dx, -dy);
  if (angle < 0) angle += 2 * Math.PI;
  const at = angle / (2 * Math.PI);
  const index = slices.findIndex((s) => s.fraction > 0 && at >= s.start && at < s.start + s.fraction);
  if (index >= 0) return index;
  // 부동소수 오차로 끝(1.0 근처)이 비면 마지막 조각
  for (let i = slices.length - 1; i >= 0; i--) if (slices[i].fraction > 0) return i;
  return null;
}

/**
 * 캡션 위치를 계산한다.
 * @param slices toSlices 결과
 * @param radius 차트 바깥 반지름
 * @param labelHeight 캡션 한 개 높이 (이 간격 이상 떨어뜨린다)
 */
export function layoutPieLabels(slices: readonly PieSlice[], radius: number, labelHeight: number): PieLabel[] {
  const reach = radius + labelHeight / 2;
  const items = slices.map((s, index) => {
    const angle = 2 * Math.PI * (s.start + s.fraction / 2);
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    return {
      index,
      sin,
      anchorX: (radius + 2) * sin,
      anchorY: -(radius + 2) * cos,
      desiredY: -reach * cos,
    };
  });

  // 12시·6시 근처(좌우가 애매한 것, 0% 조각 포함)는 캡션이 적은 쪽으로 보낸다
  const sides: ('left' | 'right')[] = new Array(items.length);
  let left = 0;
  let right = 0;
  const poles: typeof items = [];
  for (const it of items) {
    if (Math.abs(it.sin) < 0.05) {
      poles.push(it);
    } else if (it.sin > 0) {
      sides[it.index] = 'right';
      right++;
    } else {
      sides[it.index] = 'left';
      left++;
    }
  }
  for (const it of poles) {
    if (right <= left) {
      sides[it.index] = 'right';
      right++;
    } else {
      sides[it.index] = 'left';
      left++;
    }
  }

  const ys: number[] = new Array(items.length);
  for (const side of ['left', 'right'] as const) {
    const column = items.filter((it) => sides[it.index] === side).sort((a, b) => a.desiredY - b.desiredY || a.index - b.index);
    if (column.length === 0) continue;
    // 위에서부터 겹치지 않게 민다
    const placed: number[] = [];
    for (const [i, it] of column.entries()) {
      placed.push(i === 0 ? it.desiredY : Math.max(it.desiredY, placed[i - 1] + labelHeight));
    }
    // 아래로 넘쳤으면 통째로 끌어올린다 (간격은 그대로). 차트 높이보다 길면 가운데 맞춤.
    const first = placed[0];
    const last = placed[placed.length - 1];
    if (last > reach) {
      const lift = last - first > 2 * reach ? (first + last) / 2 : Math.min(last - reach, first + reach);
      for (let i = 0; i < placed.length; i++) placed[i] -= lift;
    }
    column.forEach((it, i) => (ys[it.index] = placed[i]));
  }

  return items.map((it) => ({ side: sides[it.index], y: ys[it.index], anchorX: it.anchorX, anchorY: it.anchorY }));
}
