/**
 * 앱 데이터 백업·복원 (화면·파일 시스템과 무관한 부분).
 * 백업 파일은 앱 DB를 통째로 복사한 SQLite 파일(VACUUM INTO)이고,
 * 복원은 그 파일의 표 내용을 앱 DB에 그대로 옮긴다 (예전 버전 백업이면 겹치는 열만).
 */
import type { SqlDb, SqlParam } from './adapter';

/** 복원할 표 (부모 → 자식 순서. 지울 때는 거꾸로) */
export const BACKUP_TABLES = [
  'categories',
  'payment_methods',
  'benefit_types',
  'tags',
  'transactions',
  'transaction_tags',
  'transaction_benefits',
  'app_settings',
  'day_marks',
] as const;

/** 이 앱 백업으로 보려면 꼭 있어야 하는 표 */
const REQUIRED_TABLES = ['transactions', 'categories', 'payment_methods', 'app_settings'];

/** 마지막 백업 시각 설정 키 (YYYY-MM-DD HH:MM) */
export const LAST_BACKUP_KEY = 'last_backup_at';
/** 마지막으로 백업을 저장한 폴더 URI (다음에 폴더 고를 때 처음 위치) */
export const BACKUP_DIR_KEY = 'last_backup_dir';

/** 한 번의 INSERT에 넣는 최대 값 개수 (SQLite 변수 제한 999 아래로) */
const MAX_VARS = 900;

export interface RestoreSummary {
  /** 지출·수입 건수 (할부 총액 행 제외) */
  transactions: number;
  categories: number;
  /** 백업 파일에 없어서 비워 둔 표 (예전 버전 백업) */
  missingTables: string[];
}

/**
 * 표 이름 목록.
 */
async function tableNames(db: SqlDb): Promise<Set<string>> {
  const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(rows.map((r) => r.name));
}

/**
 * 표의 열 이름 목록.
 */
async function columnNames(db: SqlDb, table: string): Promise<string[]> {
  const rows = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((r) => r.name);
}

/**
 * 이 앱에서 만든 백업 파일인지 확인한다.
 * @param source 백업 파일 DB
 */
export async function isAppBackup(source: SqlDb): Promise<boolean> {
  const names = await tableNames(source);
  return REQUIRED_TABLES.every((t) => names.has(t));
}

/**
 * 백업 파일 이름. 예) 가계부백업_20261106_2130.db
 * @param now 기준 시각
 */
export function backupFileName(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `가계부백업_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.db`;
}

/**
 * 표시용 시각 문자열 YYYY-MM-DD HH:MM.
 * @param now 기준 시각
 */
export function formatBackupTime(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

/**
 * 백업 파일 DB의 내용으로 앱 DB를 바꾼다. 전부 한 트랜잭션이라 중간에 실패하면 원래대로 남는다.
 * 백업에만 있는 열은 버리고, 앱 DB에만 있는 열은 기본값이 들어간다.
 * @param source 백업 파일 DB (읽기만 함)
 * @param target 앱 DB
 */
export async function restoreFromDb(source: SqlDb, target: SqlDb): Promise<RestoreSummary> {
  if (!(await isAppBackup(source))) throw new Error('이 가계부 앱의 백업 파일이 아닙니다');
  const sourceTables = await tableNames(source);

  // 먼저 백업 내용을 모두 읽어 둔다 (쓰기 트랜잭션 중에 다른 DB를 오래 읽지 않도록)
  const data = new Map<string, { columns: string[]; rows: Record<string, SqlParam>[] }>();
  const missingTables: string[] = [];
  for (const table of BACKUP_TABLES) {
    if (!sourceTables.has(table)) {
      missingTables.push(table);
      continue;
    }
    const targetCols = new Set(await columnNames(target, table));
    const columns = (await columnNames(source, table)).filter((c) => targetCols.has(c));
    // 할부 총액 행이 분할 건보다 먼저 들어가도록 parent_id 없는 행부터
    const order = table === 'transactions' ? 'ORDER BY (parent_id IS NOT NULL), id' : '';
    const rows = await source.all<Record<string, SqlParam>>(`SELECT ${columns.join(', ')} FROM ${table} ${order}`);
    data.set(table, { columns, rows });
  }

  await target.transaction(async () => {
    for (const table of [...BACKUP_TABLES].reverse()) await target.run(`DELETE FROM ${table}`);
    for (const table of BACKUP_TABLES) {
      const entry = data.get(table);
      if (!entry || entry.rows.length === 0 || entry.columns.length === 0) continue;
      const { columns, rows } = entry;
      const perInsert = Math.max(1, Math.floor(MAX_VARS / columns.length));
      const placeholder = `(${columns.map(() => '?').join(', ')})`;
      for (let i = 0; i < rows.length; i += perInsert) {
        const chunk = rows.slice(i, i + perInsert);
        await target.run(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${chunk.map(() => placeholder).join(', ')}`,
          chunk.flatMap((r) => columns.map((c) => r[c] ?? null)),
        );
      }
    }
  });

  const tx = await target.first<{ n: number }>("SELECT COUNT(*) AS n FROM transactions WHERE kind != 'installment_parent'");
  const cats = await target.first<{ n: number }>('SELECT COUNT(*) AS n FROM categories');
  return { transactions: tx?.n ?? 0, categories: cats?.n ?? 0, missingTables };
}
