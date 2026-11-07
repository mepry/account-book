/**
 * expo-sqlite 기반 SqlDb 구현.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import type { SqlDb, SqlParam } from './adapter';

/**
 * expo-sqlite 데이터베이스를 SqlDb로 감싼다.
 * @param db expo-sqlite 데이터베이스
 * @returns SqlDb 구현
 */
export function wrapExpoDb(db: SQLiteDatabase): SqlDb {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      const r = await db.runAsync(sql, params as SqlParam[]);
      return { lastInsertRowId: r.lastInsertRowId, changes: r.changes };
    },
    all: (sql, params = []) => db.getAllAsync(sql, params as SqlParam[]),
    first: (sql, params = []) => db.getFirstAsync(sql, params as SqlParam[]),
    transaction: (fn) => db.withTransactionAsync(fn),
  };
}
