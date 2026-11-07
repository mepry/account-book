/**
 * 데이터 변경 알림. 저장/삭제/복원 후 bumpDataVersion()을 부르면
 * useDataVersion()을 쓰는 화면이 다시 조회한다.
 */
import { useSyncExternalStore } from 'react';

let version = 0;
const listeners = new Set<() => void>();

/** 데이터가 바뀌었음을 알린다. */
export function bumpDataVersion(): void {
  version++;
  for (const l of listeners) l();
}

/** 현재 데이터 버전 (바뀔 때마다 리렌더). */
export function useDataVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}
