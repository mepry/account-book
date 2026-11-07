/**
 * SQLite 드라이버 공통 인터페이스.
 * 앱에서는 expo-sqlite, 테스트(Node)에서는 better-sqlite3 구현을 쓴다.
 */
export type SqlParam = string | number | null;

export interface RunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface SqlDb {
  /** 결과 없는 SQL 여러 문장 실행 (신뢰할 수 있는 SQL만) */
  exec(sql: string): Promise<void>;
  /** INSERT/UPDATE/DELETE 실행 */
  run(sql: string, params?: readonly SqlParam[]): Promise<RunResult>;
  /** 모든 행 조회 */
  all<T>(sql: string, params?: readonly SqlParam[]): Promise<T[]>;
  /** 첫 행 조회 */
  first<T>(sql: string, params?: readonly SqlParam[]): Promise<T | null>;
  /** 트랜잭션 안에서 fn 실행 (실패 시 롤백) */
  transaction(fn: () => Promise<void>): Promise<void>;
}
