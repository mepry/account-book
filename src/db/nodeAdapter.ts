/**
 * better-sqlite3 기반 SqlDb 구현 (Node 테스트/검증 스크립트 전용, 앱 번들에 포함하지 않음).
 */
import type BetterSqlite3 from 'better-sqlite3';
import type { SqlDb } from './adapter';

/**
 * better-sqlite3 데이터베이스를 SqlDb로 감싼다.
 * @param db better-sqlite3 데이터베이스
 * @returns SqlDb 구현
 */
export function wrapNodeDb(db: BetterSqlite3.Database): SqlDb {
  return {
    exec: async (sql) => {
      db.exec(sql);
    },
    run: async (sql, params = []) => {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: r.changes };
    },
    all: async <T>(sql: string, params: readonly (string | number | null)[] = []) =>
      db.prepare(sql).all(...params) as T[],
    first: async <T>(sql: string, params: readonly (string | number | null)[] = []) =>
      (db.prepare(sql).get(...params) as T | undefined) ?? null,
    transaction: async (fn) => {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
