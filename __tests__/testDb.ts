/**
 * 테스트 공용: 비어 있는 메모리 앱 DB.
 */
import Database from 'better-sqlite3';
import type { SqlDb } from '../src/db/adapter';
import { wrapNodeDb } from '../src/db/nodeAdapter';

/**
 * 비어 있는 메모리 앱 DB를 만든다.
 * @returns better-sqlite3 원본과 앱 어댑터
 */
export function openMemoryTarget(): { raw: Database.Database; db: SqlDb } {
  const raw = new Database(':memory:');
  return { raw, db: wrapNodeDb(raw) };
}
