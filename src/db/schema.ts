/**
 * 앱 DB 스키마와 초기화.
 * 합계·달력·통계는 반드시 v_ledger 뷰를 사용한다 (할부 총액 행 이중 집계 방지).
 */
import type { SqlDb } from './adapter';

export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  default_excluded INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  kind TEXT NOT NULL DEFAULT 'normal'
    CHECK (kind IN ('normal', 'installment_parent', 'installment_part')),
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '00:00',
  amount INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
  installment_months INTEGER NOT NULL DEFAULT 1,
  installment_seq INTEGER,
  parent_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
  excluded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tx_type_date ON transactions(type, date);
CREATE INDEX IF NOT EXISTS idx_tx_parent ON transactions(parent_id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_tt_tag ON transaction_tags(tag_id);

CREATE TABLE IF NOT EXISTS benefit_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transaction_benefits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  benefit_type_id INTEGER NOT NULL REFERENCES benefit_types(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tb_tx ON transaction_benefits(transaction_id);

-- 앱 설정 (테마 등)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 날짜별 이모지 (지출·수입 달력 공용)
CREATE TABLE IF NOT EXISTS day_marks (
  date TEXT PRIMARY KEY,
  emoji TEXT NOT NULL
);

-- 날짜별 칸 배경색 (지출·수입 달력 공용, 값은 theme.ts DAY_COLORS의 키)
CREATE TABLE IF NOT EXISTS day_colors (
  date TEXT PRIMARY KEY,
  color TEXT NOT NULL
);

-- 월별 고정지출·예산 (카테고리별 계획 금액). 한 달에 한 카테고리는 한 번만
CREATE TABLE IF NOT EXISTS budget_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ym TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fixed', 'budget')),
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  UNIQUE (ym, category_id)
);

-- 카드 결제 문자 자동 추가 기록 (같은 문자 중복 방지, 취소 문자 대상 찾기)
CREATE TABLE IF NOT EXISTS sms_imports (
  key TEXT PRIMARY KEY,
  transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  received_at TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS v_ledger AS
  SELECT * FROM transactions WHERE kind != 'installment_parent';
`;

/** 새 입력 시 "통계 제외"가 기본으로 체크되는 지출 대분류 */
export const DEFAULT_EXCLUDED_CATEGORIES: readonly string[] = ['저축', '교통비'];

/** 처음 넣는 기본 혜택 종류 */
const DEFAULT_BENEFIT_TYPES = ['카카오포인트', '네이버포인트', '할인쿠폰'];

/** 새로 설치했을 때 넣는 기본 카테고리 (대분류: 소분류[]) */
const DEFAULT_CATEGORIES: Record<'expense' | 'income', [string, string[]][]> = {
  expense: [
    ['식비', ['식사/간식', '배달']],
    ['카페/음료', ['음료']],
    ['교통비', ['대중교통', '택시']],
    ['쇼핑비', ['옷', '전자제품']],
    ['미용비', ['화장품', '미용실']],
    ['문화생활비', ['영화/공연', '도서']],
    ['주거생활비', ['통신비', '생활용품']],
    ['건강관리비', ['병원/약']],
    ['사회생활비', ['선물/용돈']],
    ['저축', ['예금/적금', '주식/펀드']],
    ['기타', []],
  ],
  income: [
    ['근로소득', ['급여', '보너스']],
    ['기타', []],
  ],
};

/**
 * 스키마를 만들고, 카테고리가 비어 있으면 기본 카테고리를 넣는다.
 * @param db 대상 DB
 */
export async function initSchema(db: SqlDb): Promise<void> {
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec(SCHEMA_SQL);
  const row = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM categories');
  if (!row || row.n === 0) await seedDefaultCategories(db);
  const bt = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM benefit_types');
  if (!bt || bt.n === 0) await seedDefaultBenefitTypes(db);
  const version = (await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  if (version < SCHEMA_VERSION) await db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

/**
 * 기본 혜택 종류를 넣는다.
 * @param db 대상 DB
 */
export async function seedDefaultBenefitTypes(db: SqlDb): Promise<void> {
  for (const [i, name] of DEFAULT_BENEFIT_TYPES.entries()) {
    await db.run('INSERT OR IGNORE INTO benefit_types (name, sort) VALUES (?, ?)', [name, i]);
  }
}

/**
 * 기본 카테고리를 넣는다.
 * @param db 대상 DB
 */
export async function seedDefaultCategories(db: SqlDb): Promise<void> {
  await db.transaction(async () => {
    for (const type of ['expense', 'income'] as const) {
      let sort = 0;
      for (const [major, minors] of DEFAULT_CATEGORIES[type]) {
        const { lastInsertRowId } = await db.run(
          'INSERT INTO categories (name, parent_id, type, default_excluded, sort) VALUES (?, NULL, ?, ?, ?)',
          [major, type, type === 'expense' && DEFAULT_EXCLUDED_CATEGORIES.includes(major) ? 1 : 0, sort++],
        );
        let sub = 0;
        for (const minor of minors) {
          await db.run('INSERT INTO categories (name, parent_id, type, sort) VALUES (?, ?, ?, ?)', [
            minor,
            lastInsertRowId,
            type,
            sub++,
          ]);
        }
      }
    }
    await db.run("INSERT INTO payment_methods (name, sort) VALUES ('현금', 0), ('카드', 1)");
  });
}
