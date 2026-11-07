/**
 * 화면에서 앱 DB(SqlDb)를 쓰기 위한 훅.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';
import type { SqlDb } from '../db/adapter';
import { wrapExpoDb } from '../db/expoAdapter';

/** SQLiteProvider의 DB를 SqlDb로 감싸서 돌려준다. */
export function useDb(): SqlDb {
  const raw = useSQLiteContext();
  return useMemo(() => wrapExpoDb(raw), [raw]);
}
