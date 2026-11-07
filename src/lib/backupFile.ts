/**
 * 백업 파일 만들기·저장하기, 백업 파일 골라서 복원하기 (기기 파일 시스템 쪽).
 * - 백업: 앱 DB를 캐시에 통째로 복사(VACUUM INTO) → 사용자가 고른 폴더(다운로드, 구글 드라이브 등)에 저장
 * - 복원: 백업 파일 선택 → 복원 직전 상태를 앱 폴더에 자동 저장 → 표 내용 옮기기
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { SqlDb } from '../db/adapter';
import { BACKUP_DIR_KEY, backupFileName, formatBackupTime, LAST_BACKUP_KEY, restoreFromDb, type RestoreSummary } from '../db/backup';
import { wrapExpoDb } from '../db/expoAdapter';
import { getSetting, setSetting } from '../db/queries';
import { log } from './logger';

/**
 * file:// URI를 SQLite에 넘길 폴더 경로와 파일 이름으로 나눈다.
 * @param uri file:// URI 또는 절대 경로
 * @returns 폴더 경로와 파일 이름
 */
export function splitFileUri(uri: string): { directory: string; name: string } {
  const path = decodeURIComponent(uri.replace(/^file:\/\//i, ''));
  const slash = path.lastIndexOf('/');
  return { directory: path.slice(0, slash), name: path.slice(slash + 1) };
}

/** 복원 직전 자동 저장 파일 이름 (앱 문서 폴더, 매번 덮어씀) */
const BEFORE_RESTORE_NAME = '복원전_자동백업.db';

/**
 * file:// URI를 SQLite가 쓰는 파일 경로로 바꾼다.
 */
const toPath = (uri: string): string => decodeURIComponent(uri.replace(/^file:\/\//i, ''));

/** SQL 문자열 리터럴용 작은따옴표 처리 */
const quote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** 사용자가 선택 창을 닫았는지 */
const isCancel = (e: unknown): boolean => e instanceof Error && /cancel/i.test(e.message);

/**
 * 앱 DB를 파일 하나로 통째로 복사한다 (같은 이름이 있으면 지우고 새로 만든다).
 * @param db 앱 DB
 * @param file 만들 파일
 */
async function snapshot(db: SqlDb, file: File): Promise<void> {
  if (file.exists) file.delete();
  await db.exec(`VACUUM INTO ${quote(toPath(file.uri))}`);
}

/**
 * 백업 파일을 만들어 사용자가 고른 폴더에 저장한다. 폴더 선택을 취소하면 null.
 * @param db 앱 DB
 * @returns 저장한 파일 이름과 시각
 */
export async function saveBackup(db: SqlDb): Promise<{ name: string; at: string } | null> {
  const now = new Date();
  const name = backupFileName(now);

  let dir: Directory;
  try {
    const lastDir = await getSetting(db, BACKUP_DIR_KEY);
    dir = await Directory.pickDirectoryAsync(lastDir ?? undefined);
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }

  const temp = new File(Paths.cache, name);
  try {
    await snapshot(db, temp);
    const out = dir.createFile(name, 'application/octet-stream');
    await out.write(await temp.bytes());
    log.info(`[backup] 저장: ${out.uri} (${temp.size ?? '?'} bytes)`);
  } finally {
    if (temp.exists) temp.delete();
  }

  const at = formatBackupTime(now);
  await setSetting(db, LAST_BACKUP_KEY, at);
  await setSetting(db, BACKUP_DIR_KEY, dir.uri);
  return { name, at };
}

/**
 * 백업 파일을 골라 복원한다. 선택을 취소하면 null.
 * 복원 직전 데이터는 앱 문서 폴더에 '복원전_자동백업.db'로 남겨 둔다.
 * @param db 앱 DB
 */
export async function pickAndRestoreBackup(db: SqlDb): Promise<RestoreSummary | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  log.info(`[restore] 선택한 파일: ${asset.name} (${asset.size ?? '?'} bytes)`);

  // 캐시에 복사된 파일을 그 자리에서 SQLite로 연다 (Expo 파일 권한 때문에 다른 곳으로 옮기지 않음)
  const { directory, name } = splitFileUri(asset.uri);
  let source: SQLiteDatabase | null = null;
  try {
    source = await openDatabaseAsync(name, { useNewConnection: true }, directory);
    await snapshot(db, new File(Paths.document, BEFORE_RESTORE_NAME));
    // 이 기기의 백업 기록(마지막 백업 시각·폴더)은 백업 파일 값으로 덮지 않고 그대로 둔다
    const keep = await Promise.all([LAST_BACKUP_KEY, BACKUP_DIR_KEY].map(async (k) => [k, await getSetting(db, k)] as const));
    const summary = await restoreFromDb(wrapExpoDb(source), db);
    for (const [k, v] of keep) if (v !== null) await setSetting(db, k, v);
    return summary;
  } catch (e) {
    // SQLite 파일이 아니면 "file is not a database" 같은 오류가 난다
    if (e instanceof Error && /not a database|malformed/i.test(e.message)) {
      throw new Error('백업 파일(.db)이 아닙니다');
    }
    throw e;
  } finally {
    await source?.closeAsync();
  }
}

/**
 * 마지막 백업 시각 (없으면 null).
 * @param db 앱 DB
 */
export function getLastBackupAt(db: SqlDb): Promise<string | null> {
  return getSetting(db, LAST_BACKUP_KEY);
}
