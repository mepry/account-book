/**
 * 앱 화면용 조회/저장 쿼리.
 * 합계·목록·통계는 모두 v_ledger(할부 총액 행 제외)를 쓴다.
 * 할부 거래의 태그·메모는 총액 행(parent)에만 있으므로 COALESCE(parent_id, id)로 연결한다.
 */
import type { SqlDb, SqlParam } from './adapter';
import { splitInstallment } from '../lib/installment';

export type TxType = 'expense' | 'income';

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  type: TxType;
  default_excluded: number;
  sort: number;
}

export interface PaymentMethod {
  id: number;
  name: string;
  sort: number;
  hidden: number;
}

export interface BenefitType {
  id: number;
  name: string;
  sort: number;
}

/** 거래에 붙은 혜택 한 줄 (금액은 기록용, 합계에 영향 없음) */
export interface TxBenefit {
  typeId: number;
  amount: number;
}

/** 목록에 보여줄 거래 한 줄 */
export interface LedgerItem {
  id: number;
  /** 수정 대상 id (할부 분할 건이면 총액 행 id) */
  edit_id: number;
  kind: 'normal' | 'installment_part';
  date: string;
  time: string;
  amount: number;
  title: string;
  detail: string;
  memo: string;
  excluded: number;
  installment_months: number;
  installment_seq: number | null;
  category: string | null;
  payment: string | null;
  tags: string | null;
}

/** 입력 폼 값 */
export interface TxInput {
  type: TxType;
  date: string;
  time: string;
  /** 일시불이면 금액, 할부면 총액 */
  amount: number;
  title: string;
  detail: string;
  memo: string;
  /** 혜택 목록 (지출만) */
  benefits: TxBenefit[];
  categoryId: number | null;
  paymentMethodId: number | null;
  /** 1 = 일시불, 2~24 = 할부 */
  installmentMonths: number;
  excluded: boolean;
  tags: string[];
}

/** 수정용으로 불러온 거래 */
export interface TxForEdit extends TxInput {
  id: number;
}

const excludedClause = (includeExcluded: boolean): string => (includeExcluded ? '' : 'AND l.excluded = 0');

/** 달력·그날 내역 조회 옵션 */
export interface LedgerQueryOptions {
  /** 할부 분할 건을 뺀다 (달력 아래 할부금 영역에 따로 보여줄 때) */
  skipInstallmentParts?: boolean;
}

const partsClause = (opts: LedgerQueryOptions): string =>
  opts.skipInstallmentParts ? "AND l.kind != 'installment_part'" : '';

/**
 * 한 달 일별 합계.
 * @param db DB
 * @param type 지출/수입
 * @param ym YYYY-MM
 * @param includeExcluded 제외 항목 포함 여부
 * @param opts skipInstallmentParts = 할부 분할 건 빼기 (달력 칸용)
 */
export async function getDailyTotals(
  db: SqlDb,
  type: TxType,
  ym: string,
  includeExcluded: boolean,
  opts: LedgerQueryOptions = {},
): Promise<Record<string, number>> {
  const rows = await db.all<{ date: string; total: number }>(
    `SELECT l.date, SUM(l.amount) AS total FROM v_ledger l
     WHERE l.type = ? AND l.date LIKE ? ${excludedClause(includeExcluded)} ${partsClause(opts)}
     GROUP BY l.date`,
    [type, `${ym}-%`],
  );
  return Object.fromEntries(rows.map((r) => [r.date, r.total]));
}

/**
 * 하루 거래 목록.
 * @param db DB
 * @param type 지출/수입
 * @param date YYYY-MM-DD
 * @param opts skipInstallmentParts = 할부 분할 건 빼기
 */
export async function getDayItems(
  db: SqlDb,
  type: TxType,
  date: string,
  opts: LedgerQueryOptions = {},
): Promise<LedgerItem[]> {
  return db.all<LedgerItem>(
    `SELECT l.id, COALESCE(l.parent_id, l.id) AS edit_id, l.kind, l.date, l.time, l.amount, l.title,
            l.detail, COALESCE(p.memo, l.memo) AS memo,
            l.excluded, l.installment_months, l.installment_seq,
            CASE WHEN pc.name IS NULL THEN c.name ELSE pc.name || ' > ' || c.name END AS category,
            pm.name AS payment,
            (SELECT GROUP_CONCAT(tg.name, ' ') FROM transaction_tags tt JOIN tags tg ON tg.id = tt.tag_id
              WHERE tt.transaction_id = COALESCE(l.parent_id, l.id)) AS tags
     FROM v_ledger l
     LEFT JOIN transactions p ON p.id = l.parent_id
     LEFT JOIN categories c ON c.id = l.category_id
     LEFT JOIN categories pc ON pc.id = c.parent_id
     LEFT JOIN payment_methods pm ON pm.id = l.payment_method_id
     WHERE l.type = ? AND l.date = ? ${partsClause(opts)}
     ORDER BY l.time, l.id`,
    [type, date],
  );
}

/** 이번 달 할부금 한 줄 (분할 건 기준) */
export interface InstallmentItem {
  /** 분할 건 id */
  id: number;
  /** 수정 대상 id (총액 행) */
  edit_id: number;
  date: string;
  title: string;
  payment: string | null;
  /** 이번 달 회차 금액 */
  amount: number;
  /** 이번 달 회차 (1부터) */
  installment_seq: number;
  installment_months: number;
  /** 할부 총액 */
  total: number;
  /** 이번 달 이후 남은 금액 */
  remaining_amount: number;
  excluded: number;
}

/**
 * 한 달에 걸린 할부 분할 건 목록 (남은 회차·금액 포함).
 * @param db DB
 * @param type 지출/수입
 * @param ym YYYY-MM
 * @param includeExcluded 제외 항목 포함 여부
 */
export async function getMonthInstallments(
  db: SqlDb,
  type: TxType,
  ym: string,
  includeExcluded: boolean,
): Promise<InstallmentItem[]> {
  return db.all<InstallmentItem>(
    `SELECT l.id, COALESCE(l.parent_id, l.id) AS edit_id, l.date, l.title, pm.name AS payment, l.amount,
            l.installment_seq, l.installment_months, COALESCE(p.amount, l.amount) AS total,
            (SELECT COALESCE(SUM(r.amount), 0) FROM transactions r
              WHERE r.parent_id = l.parent_id AND r.installment_seq > l.installment_seq) AS remaining_amount,
            l.excluded
     FROM v_ledger l
     LEFT JOIN transactions p ON p.id = l.parent_id
     LEFT JOIN payment_methods pm ON pm.id = l.payment_method_id
     WHERE l.type = ? AND l.kind = 'installment_part' AND l.date LIKE ? ${excludedClause(includeExcluded)}
     ORDER BY l.amount DESC, l.id`,
    [type, `${ym}-%`],
  );
}

/**
 * 카테고리 목록.
 * @param db DB
 * @param type 지출/수입
 */
export async function getCategories(db: SqlDb, type: TxType): Promise<Category[]> {
  return db.all<Category>('SELECT * FROM categories WHERE type = ? ORDER BY sort, id', [type]);
}

/** 추천 카테고리 한 개 */
export interface SuggestedCategory {
  id: number;
  /** 쓴 횟수 */
  count: number;
}

/**
 * 입력 폼 카테고리 추천: 같은 내역(제목)에 썼던 카테고리를 많이 쓴 순서로.
 * 같은 내역이 없거나 제목이 비어 있으면 최근 90일 동안 많이 쓴 카테고리.
 * @param db DB
 * @param type 지출/수입
 * @param title 입력 중인 내역
 * @param today 오늘 YYYY-MM-DD (최근 기간 계산용)
 * @param limit 최대 개수
 */
export async function suggestCategories(
  db: SqlDb,
  type: TxType,
  title: string,
  today: string,
  limit = 4,
): Promise<{ byTitle: boolean; items: SuggestedCategory[] }> {
  const base = `SELECT category_id AS id, COUNT(*) AS count FROM transactions
     WHERE type = ? AND kind != 'installment_part' AND category_id IS NOT NULL`;
  const tail = 'GROUP BY category_id ORDER BY count DESC, MAX(date) DESC LIMIT ?';
  const t = title.trim();
  if (t) {
    const items = await db.all<SuggestedCategory>(`${base} AND title = ? ${tail}`, [type, t, limit]);
    if (items.length) return { byTitle: true, items };
  }
  const since = new Date(`${today}T00:00:00`);
  since.setDate(since.getDate() - 90);
  const from = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
  return { byTitle: false, items: await db.all<SuggestedCategory>(`${base} AND date >= ? ${tail}`, [type, from, limit]) };
}

/**
 * 카테고리 "기본 제외" 설정을 바꾼다.
 */
export async function setCategoryDefaultExcluded(db: SqlDb, id: number, value: boolean): Promise<void> {
  await db.run('UPDATE categories SET default_excluded = ? WHERE id = ?', [value ? 1 : 0, id]);
}

/**
 * 같은 단계(같은 부모·같은 종류)에 같은 이름이 있으면 오류. 이름은 앞뒤 공백을 지운 값을 돌려준다.
 * @param exceptId 이름을 바꾸는 중이면 그 카테고리 id (자기 자신은 빼고 비교)
 */
async function checkCategoryName(
  db: SqlDb,
  type: TxType,
  parentId: number | null,
  name: string,
  exceptId?: number,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('카테고리 이름을 입력하세요');
  const dup = await db.first<{ id: number }>(
    'SELECT id FROM categories WHERE type = ? AND parent_id IS ? AND name = ? AND id IS NOT ?',
    [type, parentId, trimmed, exceptId ?? null],
  );
  if (dup) throw new Error(`'${trimmed}' 카테고리가 이미 있습니다`);
  return trimmed;
}

/**
 * 카테고리를 추가한다. 같은 단계의 맨 뒤에 붙는다.
 * @param db DB
 * @param type 지출/수입
 * @param name 이름
 * @param parentId 대분류 id (null이면 새 대분류)
 * @returns 새 카테고리 id
 */
export async function addCategory(db: SqlDb, type: TxType, name: string, parentId: number | null): Promise<number> {
  const trimmed = await checkCategoryName(db, type, parentId, name);
  const r = await db.run(
    `INSERT INTO categories (name, parent_id, type, sort)
     VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM categories WHERE type = ? AND parent_id IS ?))`,
    [trimmed, parentId, type, type, parentId],
  );
  return r.lastInsertRowId;
}

/**
 * 카테고리 이름을 바꾼다.
 */
export async function renameCategory(db: SqlDb, id: number, name: string): Promise<void> {
  const cat = await db.first<Category>('SELECT * FROM categories WHERE id = ?', [id]);
  if (!cat) throw new Error('카테고리를 찾을 수 없습니다');
  const trimmed = await checkCategoryName(db, cat.type, cat.parent_id, name, id);
  await db.run('UPDATE categories SET name = ? WHERE id = ?', [trimmed, id]);
}

/**
 * 카테고리(대분류면 하위 소분류 포함)로 입력된 거래 수 (할부는 원거래 1건).
 */
export async function countCategoryUsage(db: SqlDb, id: number): Promise<number> {
  const r = await db.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transactions
     WHERE kind != 'installment_part'
       AND category_id IN (SELECT id FROM categories WHERE id = ? OR parent_id = ?)`,
    [id, id],
  );
  return r?.n ?? 0;
}

/**
 * 카테고리를 지운다. 거래는 지우지 않고 한 단계 위로 옮긴다:
 * 소분류를 지우면 그 거래는 대분류로, 대분류를 지우면 (하위 소분류 거래까지) 미분류로.
 */
export async function deleteCategory(db: SqlDb, id: number): Promise<void> {
  await db.transaction(async () => {
    const cat = await db.first<Category>('SELECT * FROM categories WHERE id = ?', [id]);
    if (!cat) return;
    // 할부 총액 행·분할 건 모두 같이 옮긴다
    await db.run('UPDATE transactions SET category_id = ? WHERE category_id IN (SELECT id FROM categories WHERE id = ? OR parent_id = ?)', [
      cat.parent_id,
      id,
      id,
    ]);
    await db.run('DELETE FROM categories WHERE parent_id = ?', [id]);
    await db.run('DELETE FROM categories WHERE id = ?', [id]);
  });
}

/**
 * 결제수단 목록 (숨김 제외).
 */
export async function getPaymentMethods(db: SqlDb): Promise<PaymentMethod[]> {
  return db.all<PaymentMethod>('SELECT * FROM payment_methods WHERE hidden = 0 ORDER BY sort, id');
}

/**
 * 혜택 종류 목록.
 */
export async function getBenefitTypes(db: SqlDb): Promise<BenefitType[]> {
  return db.all<BenefitType>('SELECT * FROM benefit_types ORDER BY sort, id');
}

/**
 * 혜택 종류를 추가한다. 이미 있으면 그 id를 돌려준다.
 * @param db DB
 * @param name 혜택 이름
 * @returns 혜택 종류 id
 */
export async function addBenefitType(db: SqlDb, name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('혜택 이름을 입력하세요');
  await db.run(
    'INSERT OR IGNORE INTO benefit_types (name, sort) VALUES (?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM benefit_types))',
    [trimmed],
  );
  const row = await db.first<{ id: number }>('SELECT id FROM benefit_types WHERE name = ?', [trimmed]);
  return row!.id;
}

/**
 * 거래(할부면 총액 행)의 통계 제외 여부를 바꾼다. 할부는 모든 회차가 같이 바뀐다.
 * @param db DB
 * @param id 거래 id (분할 건 id여도 됨)
 * @param excluded 제외 여부
 */
export async function setTransactionExcluded(db: SqlDb, id: number, excluded: boolean): Promise<void> {
  const row = await db.first<{ root: number }>('SELECT COALESCE(parent_id, id) AS root FROM transactions WHERE id = ?', [id]);
  if (!row) return;
  await db.run('UPDATE transactions SET excluded = ? WHERE id = ? OR parent_id = ?', [excluded ? 1 : 0, row.root, row.root]);
}

/**
 * 태그 자동완성 (사용 횟수 많은 순).
 * @param db DB
 * @param prefix 입력 중인 글자
 */
export async function searchTags(db: SqlDb, prefix: string): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    `SELECT tg.name FROM tags tg LEFT JOIN transaction_tags tt ON tt.tag_id = tg.id
     WHERE tg.name LIKE ? GROUP BY tg.id ORDER BY COUNT(tt.transaction_id) DESC, tg.name LIMIT 8`,
    [`${prefix.replace(/[%_]/g, '')}%`],
  );
  return rows.map((r) => r.name);
}

/**
 * 수정용으로 거래를 불러온다. 할부 분할 건 id가 오면 총액 행을 불러온다.
 */
export async function getTransactionForEdit(db: SqlDb, id: number): Promise<TxForEdit | null> {
  const row = await db.first<{
    id: number;
    parent_id: number | null;
    type: TxType;
    date: string;
    time: string;
    amount: number;
    title: string;
    detail: string;
    memo: string;
    category_id: number | null;
    payment_method_id: number | null;
    installment_months: number;
    excluded: number;
  }>('SELECT * FROM transactions WHERE id = (SELECT COALESCE(parent_id, id) FROM transactions WHERE id = ?)', [id]);
  if (!row) return null;
  const tags = await db.all<{ name: string }>(
    'SELECT tg.name FROM transaction_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.transaction_id = ? ORDER BY tg.name',
    [row.id],
  );
  const benefits = await db.all<{ typeId: number; amount: number }>(
    'SELECT benefit_type_id AS typeId, amount FROM transaction_benefits WHERE transaction_id = ? ORDER BY sort, id',
    [row.id],
  );
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    time: row.time,
    amount: row.amount,
    title: row.title,
    detail: row.detail,
    memo: row.memo,
    benefits,
    categoryId: row.category_id,
    paymentMethodId: row.payment_method_id,
    installmentMonths: row.installment_months,
    excluded: row.excluded === 1,
    tags: tags.map((t) => t.name),
  };
}

/**
 * 태그 이름을 정리한다: 앞의 #과 공백을 떼고, 빈 값과 중복을 뺀다 (순서 유지).
 * @param tags 입력한 태그
 * @returns 저장할 태그 이름
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const names = tags.map((t) => t.replace(/^#+/, '').trim()).filter((t) => t !== '');
  return [...new Set(names)];
}

/**
 * 거래 태그를 교체한다.
 */
async function replaceTags(db: SqlDb, txId: number, tags: readonly string[]): Promise<void> {
  await db.run('DELETE FROM transaction_tags WHERE transaction_id = ?', [txId]);
  for (const name of normalizeTags(tags)) {
    await db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [name]);
    const tag = await db.first<{ id: number }>('SELECT id FROM tags WHERE name = ?', [name]);
    if (tag) {
      await db.run('INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)', [txId, tag.id]);
    }
  }
}

/**
 * 거래 혜택을 교체한다. 종류가 없는 줄은 무시한다.
 */
async function replaceBenefits(db: SqlDb, txId: number, benefits: readonly TxBenefit[]): Promise<void> {
  await db.run('DELETE FROM transaction_benefits WHERE transaction_id = ?', [txId]);
  for (const [i, b] of benefits.entries()) {
    if (!b.typeId) continue;
    await db.run('INSERT INTO transaction_benefits (transaction_id, benefit_type_id, amount, sort) VALUES (?, ?, ?, ?)', [
      txId,
      b.typeId,
      Math.max(0, Math.round(b.amount || 0)),
      i,
    ]);
  }
}

/**
 * 거래를 저장한다 (새로 만들기 또는 수정).
 * 할부(2~24개월, 지출)면 총액 행 + 분할 n건을 만들고, 수정 시 분할 건을 다시 만든다.
 * @param db DB
 * @param input 폼 값
 * @param id 수정할 거래 id (총액 행 또는 일반 거래), 새로 만들면 undefined
 * @returns 저장된 거래(또는 총액 행) id
 */
export async function saveTransaction(db: SqlDb, input: TxInput, id?: number): Promise<number> {
  const months = input.type === 'expense' ? input.installmentMonths : 1;
  const isInstallment = months >= 2;
  let savedId = id ?? 0;

  await db.transaction(async () => {
    const values = [
      input.type,
      isInstallment ? 'installment_parent' : 'normal',
      input.date,
      input.time,
      input.amount,
      input.title.trim(),
      input.detail.trim(),
      input.memo.trim(),
      input.categoryId,
      input.paymentMethodId,
      isInstallment ? months : 1,
      input.excluded ? 1 : 0,
    ];
    if (id === undefined) {
      const r = await db.run(
        `INSERT INTO transactions (type, kind, date, time, amount, title, detail, memo,
           category_id, payment_method_id, installment_months, excluded)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values,
      );
      savedId = r.lastInsertRowId;
    } else {
      await db.run(
        `UPDATE transactions SET type = ?, kind = ?, date = ?, time = ?, amount = ?, title = ?, detail = ?,
           memo = ?, category_id = ?, payment_method_id = ?, installment_months = ?, excluded = ?
         WHERE id = ?`,
        [...values, id],
      );
      await db.run('DELETE FROM transactions WHERE parent_id = ?', [id]);
    }

    if (isInstallment) {
      for (const part of splitInstallment(input.amount, months, input.date)) {
        await db.run(
          `INSERT INTO transactions (type, kind, date, time, amount, title, detail, category_id,
             payment_method_id, installment_months, installment_seq, parent_id, excluded)
           VALUES (?, 'installment_part', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.type,
            part.date,
            input.time,
            part.amount,
            input.title.trim(),
            input.detail.trim(),
            input.categoryId,
            input.paymentMethodId,
            months,
            part.seq,
            savedId,
            input.excluded ? 1 : 0,
          ],
        );
      }
    }
    await replaceTags(db, savedId, input.tags);
    await replaceBenefits(db, savedId, input.type === 'expense' ? input.benefits : []);
  });
  return savedId;
}

/**
 * 거래를 지운다. 할부 분할 건이면 할부 전체(총액 행 + 분할 건)를 지운다.
 */
export async function deleteTransaction(db: SqlDb, id: number): Promise<void> {
  await db.transaction(async () => {
    const row = await db.first<{ root: number }>(
      'SELECT COALESCE(parent_id, id) AS root FROM transactions WHERE id = ?',
      [id],
    );
    if (!row) return;
    await db.run('DELETE FROM transaction_benefits WHERE transaction_id = ?', [row.root]);
    await db.run(
      'DELETE FROM transaction_tags WHERE transaction_id IN (SELECT id FROM transactions WHERE id = ? OR parent_id = ?)',
      [row.root, row.root],
    );
    await db.run('DELETE FROM transactions WHERE parent_id = ?', [row.root]);
    await db.run('DELETE FROM transactions WHERE id = ?', [row.root]);
  });
}

// ---------------- 앱 설정 ----------------

/** 테마 설정 키 */
export const THEME_SETTING_KEY = 'theme';

/**
 * 앱 설정 값을 읽는다. 없으면 null.
 * @param db DB
 * @param key 설정 키
 */
export async function getSetting(db: SqlDb, key: string): Promise<string | null> {
  const row = await db.first<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

/**
 * 앱 설정 값을 저장한다 (있으면 덮어쓰기).
 * @param db DB
 * @param key 설정 키
 * @param value 값
 */
export async function setSetting(db: SqlDb, key: string, value: string): Promise<void> {
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

// ---------------- 날짜 이모지 ----------------

/**
 * 한 달(앞뒤 달 일부 포함 가능)의 날짜별 이모지. 지출·수입 공용.
 * @param db DB
 * @param from 시작 YYYY-MM-DD
 * @param to 끝 YYYY-MM-DD
 * @returns { 'YYYY-MM-DD': '🎉' }
 */
export async function getDayMarks(db: SqlDb, from: string, to: string): Promise<Record<string, string>> {
  const rows = await db.all<{ date: string; emoji: string }>(
    'SELECT date, emoji FROM day_marks WHERE date BETWEEN ? AND ?',
    [from, to],
  );
  return Object.fromEntries(rows.map((r) => [r.date, r.emoji]));
}

/**
 * 날짜 이모지를 정한다. 빈 값이면 지운다.
 * @param db DB
 * @param date YYYY-MM-DD
 * @param emoji 이모지 (null/빈 값 = 지우기)
 */
export async function setDayMark(db: SqlDb, date: string, emoji: string | null): Promise<void> {
  const value = emoji?.trim();
  if (!value) {
    await db.run('DELETE FROM day_marks WHERE date = ?', [date]);
    return;
  }
  await db.run(
    'INSERT INTO day_marks (date, emoji) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET emoji = excluded.emoji',
    [date, value],
  );
}

// ---------------- 날짜 색 ----------------

/**
 * 한 달(앞뒤 달 일부 포함 가능)의 날짜별 칸 배경색 키. 지출·수입 공용.
 * @param db DB
 * @param from 시작 YYYY-MM-DD
 * @param to 끝 YYYY-MM-DD
 * @returns { 'YYYY-MM-DD': 'pink' }
 */
export async function getDayColors(db: SqlDb, from: string, to: string): Promise<Record<string, string>> {
  const rows = await db.all<{ date: string; color: string }>(
    'SELECT date, color FROM day_colors WHERE date BETWEEN ? AND ?',
    [from, to],
  );
  return Object.fromEntries(rows.map((r) => [r.date, r.color]));
}

/**
 * 날짜 칸 배경색을 정한다. 빈 값이면 지운다.
 * @param db DB
 * @param date YYYY-MM-DD
 * @param color 색 키 (null/빈 값 = 지우기)
 */
export async function setDayColor(db: SqlDb, date: string, color: string | null): Promise<void> {
  if (!color) {
    await db.run('DELETE FROM day_colors WHERE date = ?', [date]);
    return;
  }
  await db.run(
    'INSERT INTO day_colors (date, color) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET color = excluded.color',
    [date, color],
  );
}

// ---------------- 검색 ----------------

/** 검색 결과 한 줄 (할부는 총액 행 하나로 나온다) */
export interface SearchItem {
  id: number;
  date: string;
  time: string;
  amount: number;
  title: string;
  detail: string;
  memo: string;
  excluded: number;
  installment_months: number;
  category: string | null;
  tags: string | null;
}

/** LIKE 검색어로 정리한다 (앞 # 제거, 와일드카드 문자 제거). 빈 값이면 null. */
const toLike = (keyword: string): string | null => {
  const q = keyword.trim().replace(/^#/, '').replace(/[%_]/g, '');
  return q ? `%${q}%` : null;
};

/** 검색 조건. 값이 있는 것만 AND로 건다. */
export interface SearchFilter {
  /** 내역·상세·메모·태그 검색어 (태그는 # 붙여도 됨) */
  query?: string;
  /** 시작일 YYYY-MM-DD (포함). from·to 둘 다 없으면 전체 기간 */
  from?: string | null;
  /** 종료일 YYYY-MM-DD (포함) */
  to?: string | null;
  /** 카테고리 id. 대분류면 하위 소분류까지 포함. null = 전체 */
  categoryId?: number | null;
}

/**
 * 검색어·기간·카테고리로 거래를 찾는다. 최신순, 최대 300건.
 * 조건이 하나도 없으면(검색어 빈칸 + 전체 기간 + 전체 카테고리) 빈 목록.
 * @param db DB
 * @param type 지출/수입
 * @param filter 검색 조건
 */
export async function searchTransactions(db: SqlDb, type: TxType, filter: SearchFilter): Promise<SearchItem[]> {
  const parts: string[] = [];
  const params: SqlParam[] = [type];
  const like = filter.query ? toLike(filter.query) : null;
  if (like) {
    parts.push(`AND (t.title LIKE ? OR t.detail LIKE ? OR t.memo LIKE ?
            OR EXISTS (SELECT 1 FROM transaction_tags tt JOIN tags tg ON tg.id = tt.tag_id
                       WHERE tt.transaction_id = t.id AND tg.name LIKE ?))`);
    params.push(like, like, like, like);
  }
  if (filter.from) {
    parts.push('AND t.date >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    parts.push('AND t.date <= ?');
    params.push(filter.to);
  }
  if (filter.categoryId != null) {
    parts.push('AND t.category_id IN (SELECT id FROM categories WHERE id = ? OR parent_id = ?)');
    params.push(filter.categoryId, filter.categoryId);
  }
  if (parts.length === 0) return [];
  return db.all<SearchItem>(
    `SELECT t.id, t.date, t.time, t.amount, t.title, t.detail, t.memo,
            t.excluded, t.installment_months,
            CASE WHEN pc.name IS NULL THEN c.name ELSE pc.name || ' > ' || c.name END AS category,
            (SELECT GROUP_CONCAT(tg.name, ' ') FROM transaction_tags tt JOIN tags tg ON tg.id = tt.tag_id
              WHERE tt.transaction_id = t.id) AS tags
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN categories pc ON pc.id = c.parent_id
     WHERE t.type = ? AND t.kind != 'installment_part' ${parts.join(' ')}
     ORDER BY t.date DESC, t.time DESC, t.id DESC
     LIMIT 300`,
    params,
  );
}

// ---------------- 통계 ----------------

/** 통계 필터의 "결제수단 없음" 값 (실제 결제수단 id는 1부터) */
export const NO_PAYMENT_METHOD = 0;

/** 통계 필터. 값이 있는 것만 AND로 건다. */
export interface StatsFilter {
  /** 대분류면 하위 소분류까지 포함 */
  categoryId?: number | null;
  /** 결제수단 id. NO_PAYMENT_METHOD(0)이면 결제수단 없는 내역 */
  paymentMethodId?: number | null;
  /** 이 카테고리에 바로 붙은 내역만 (소분류 포함 안 함). 원형 차트 "하위카테고리별" 조각 상세용 */
  exactCategoryId?: number | null;
  /** 검색어: 태그·내역·상세·메모에서 찾는다 (앞의 # 무시) */
  keyword?: string;
}

/**
 * 통계 필터를 v_ledger(l) 조건으로 바꾼다. 앞에 AND가 붙어 있어 WHERE 끝에 그대로 이어 붙이면 된다.
 * 할부 분할 건의 태그·메모는 총액 행에 있으므로 COALESCE(parent_id, id)로 찾는다.
 */
function filterSql(f: StatsFilter = {}): { sql: string; params: SqlParam[] } {
  const parts: string[] = [];
  const params: SqlParam[] = [];
  if (f.categoryId != null) {
    parts.push('AND l.category_id IN (SELECT id FROM categories WHERE id = ? OR parent_id = ?)');
    params.push(f.categoryId, f.categoryId);
  }
  if (f.paymentMethodId === NO_PAYMENT_METHOD) {
    parts.push('AND l.payment_method_id IS NULL');
  } else if (f.paymentMethodId != null) {
    parts.push('AND l.payment_method_id = ?');
    params.push(f.paymentMethodId);
  }
  if (f.exactCategoryId != null) {
    parts.push('AND l.category_id = ?');
    params.push(f.exactCategoryId);
  }
  const like = f.keyword ? toLike(f.keyword) : null;
  if (like) {
    // 할부 분할 건은 메모·태그가 총액 행에 있으므로 총액 행(root)에서 찾는다
    parts.push(
      `AND COALESCE(l.parent_id, l.id) IN (
         SELECT ft.id FROM transactions ft
         WHERE ft.title LIKE ? OR ft.detail LIKE ? OR ft.memo LIKE ?
            OR EXISTS (SELECT 1 FROM transaction_tags ftt JOIN tags ftg ON ftg.id = ftt.tag_id
                       WHERE ftt.transaction_id = ft.id AND ftg.name LIKE ?))`,
    );
    params.push(like, like, like, like);
  }
  return { sql: parts.join(' '), params };
}

/**
 * 기간 합계 (할부는 분할 건 기준, 카테고리·검색 필터 없이 전체).
 * @param db DB
 * @param type 지출/수입
 * @param from 시작일 (포함)
 * @param to 종료일 (포함)
 * @param includeExcluded 제외 항목 포함 여부
 */
export async function getPeriodTotal(
  db: SqlDb,
  type: TxType,
  from: string,
  to: string,
  includeExcluded: boolean,
): Promise<number> {
  const row = await db.first<{ total: number }>(
    `SELECT COALESCE(SUM(l.amount), 0) AS total FROM v_ledger l
     WHERE l.type = ? AND l.date BETWEEN ? AND ? ${excludedClause(includeExcluded)}`,
    [type, from, to],
  );
  return row?.total ?? 0;
}

export interface CategoryTotal {
  id: number | null;
  name: string;
  total: number;
}

/** 대분류별 합계 + 거래 건수 (할부는 원거래 1건) */
export interface CategoryTotalCount extends CategoryTotal {
  count: number;
}

/**
 * 기간 내 대분류별 합계. 그 기간에 내역이 하나라도 있는 대분류만 (합계가 0이어도 포함).
 * @param from 시작일 (포함)
 * @param to 종료일 (포함)
 * @param filter 통계 필터
 */
export async function getCategoryTotals(
  db: SqlDb,
  type: TxType,
  from: string,
  to: string,
  includeExcluded: boolean,
  filter: StatsFilter = {},
): Promise<CategoryTotalCount[]> {
  const f = filterSql(filter);
  return db.all<CategoryTotalCount>(
    `SELECT COALESCE(pc.id, c.id) AS id, COALESCE(pc.name, c.name, '미분류') AS name, SUM(l.amount) AS total,
            COUNT(DISTINCT COALESCE(l.parent_id, l.id)) AS count
     FROM v_ledger l
     LEFT JOIN categories c ON c.id = l.category_id
     LEFT JOIN categories pc ON pc.id = c.parent_id
     WHERE l.type = ? AND l.date BETWEEN ? AND ? ${excludedClause(includeExcluded)} ${f.sql}
     GROUP BY 1, 2 HAVING COUNT(*) > 0 ORDER BY total DESC, name`,
    [type, from, to, ...f.params],
  );
}

/**
 * 기간 내 소분류별 합계 (원형 차트 "하위카테고리별"). 대분류에 바로 붙은 내역은 대분류 이름으로.
 * @param from 시작일 (포함)
 * @param to 종료일 (포함)
 * @param filter 통계 필터
 */
export async function getMinorCategoryTotals(
  db: SqlDb,
  type: TxType,
  from: string,
  to: string,
  includeExcluded: boolean,
  filter: StatsFilter = {},
): Promise<CategoryTotal[]> {
  const f = filterSql(filter);
  return db.all<CategoryTotal>(
    `SELECT c.id,
            CASE WHEN c.id IS NULL THEN '미분류' WHEN pc.name IS NULL THEN c.name ELSE pc.name || ' > ' || c.name END AS name,
            SUM(l.amount) AS total
     FROM v_ledger l
     LEFT JOIN categories c ON c.id = l.category_id
     LEFT JOIN categories pc ON pc.id = c.parent_id
     WHERE l.type = ? AND l.date BETWEEN ? AND ? ${excludedClause(includeExcluded)} ${f.sql}
     GROUP BY 1, 2 HAVING COUNT(*) > 0 ORDER BY total DESC, name`,
    [type, from, to, ...f.params],
  );
}

/**
 * 기간 내 결제수단별 합계 (원형 차트 "결제수단별"). id null = 결제수단 없음.
 * @param from 시작일 (포함)
 * @param to 종료일 (포함)
 * @param filter 통계 필터
 */
export async function getPaymentTotals(
  db: SqlDb,
  type: TxType,
  from: string,
  to: string,
  includeExcluded: boolean,
  filter: StatsFilter = {},
): Promise<CategoryTotal[]> {
  const f = filterSql(filter);
  return db.all<CategoryTotal>(
    `SELECT pm.id, COALESCE(pm.name, '결제수단 없음') AS name, SUM(l.amount) AS total
     FROM v_ledger l
     LEFT JOIN payment_methods pm ON pm.id = l.payment_method_id
     WHERE l.type = ? AND l.date BETWEEN ? AND ? ${excludedClause(includeExcluded)} ${f.sql}
     GROUP BY 1, 2 HAVING COUNT(*) > 0 ORDER BY total DESC, name`,
    [type, from, to, ...f.params],
  );
}

/**
 * 기간 내 한 대분류의 소분류별 합계 (대분류에 바로 붙은 내역은 대분류 이름으로).
 * @param categoryId 대분류 id (null = 미분류)
 */
export async function getSubcategoryTotals(
  db: SqlDb,
  type: TxType,
  categoryId: number | null,
  from: string,
  to: string,
  includeExcluded: boolean,
  filter: StatsFilter = {},
): Promise<CategoryTotal[]> {
  const f = filterSql(filter);
  return db.all<CategoryTotal>(
    `SELECT c.id, COALESCE(c.name, '미분류') AS name, SUM(l.amount) AS total
     FROM v_ledger l
     LEFT JOIN categories c ON c.id = l.category_id
     WHERE l.type = ? AND l.date BETWEEN ? AND ? ${excludedClause(includeExcluded)} AND ${categoryFilter(categoryId)} ${f.sql}
     GROUP BY 1, 2 HAVING COUNT(*) > 0 ORDER BY total DESC, name`,
    [type, from, to, ...categoryParams(categoryId), ...f.params],
  );
}

/** 통계 상세용 내역 한 줄 */
export interface CategoryItem {
  id: number;
  /** 수정 대상 id (할부 분할 건이면 총액 행 id) */
  edit_id: number;
  date: string;
  title: string;
  detail: string;
  amount: number;
  /** 소분류 이름 (대분류에 바로 붙었으면 대분류 이름) */
  category: string | null;
  installment_months: number;
  installment_seq: number | null;
  excluded: number;
}

/**
 * 기간 내 한 대분류의 내역 목록 (할부는 분할 건 기준, 최신순).
 * @param categoryId 대분류 id (null = 미분류, ALL_CATEGORIES = 전체)
 */
export async function getCategoryItems(
  db: SqlDb,
  type: TxType,
  categoryId: number | null | typeof ALL_CATEGORIES,
  from: string,
  to: string,
  includeExcluded: boolean,
  filter: StatsFilter = {},
): Promise<CategoryItem[]> {
  const f = filterSql(filter);
  return db.all<CategoryItem>(
    `SELECT l.id, COALESCE(l.parent_id, l.id) AS edit_id, l.date, l.title, l.detail, l.amount, c.name AS category,
            l.installment_months, l.installment_seq, l.excluded
     FROM v_ledger l
     LEFT JOIN categories c ON c.id = l.category_id
     WHERE l.type = ? AND l.date BETWEEN ? AND ? ${excludedClause(includeExcluded)} AND ${categoryFilter(categoryId)} ${f.sql}
     ORDER BY l.date DESC, l.time DESC, l.id DESC`,
    [type, from, to, ...categoryParams(categoryId), ...f.params],
  );
}

/** 카테고리 상관없이 전체 (통계 원형 차트 가운데 "총 합계") */
export const ALL_CATEGORIES = 'all';

/** 대분류(자신 또는 하위 소분류)에 속하는 내역 조건. null이면 미분류, ALL_CATEGORIES면 전체. */
const categoryFilter = (categoryId: number | null | typeof ALL_CATEGORIES): string => {
  if (categoryId === ALL_CATEGORIES) return '1 = 1';
  return categoryId === null ? 'c.id IS NULL' : '(c.id = ? OR c.parent_id = ?)';
};

/** categoryFilter에 넘길 바인딩 (대분류 id면 id 2개) */
const categoryParams = (categoryId: number | null | typeof ALL_CATEGORIES): number[] =>
  typeof categoryId === 'number' ? [categoryId, categoryId] : [];

/**
 * 월별 합계 (YYYY-MM → 합계).
 * @param fromYm 시작 월 YYYY-MM
 * @param toYm 끝 월 YYYY-MM
 */
export async function getMonthlyTotals(
  db: SqlDb,
  type: TxType,
  fromYm: string,
  toYm: string,
  includeExcluded: boolean,
  filter: StatsFilter = {},
): Promise<Record<string, number>> {
  const f = filterSql(filter);
  const rows = await db.all<{ ym: string; total: number }>(
    `SELECT substr(l.date, 1, 7) AS ym, SUM(l.amount) AS total FROM v_ledger l
     WHERE l.type = ? AND substr(l.date, 1, 7) BETWEEN ? AND ? ${excludedClause(includeExcluded)} ${f.sql}
     GROUP BY ym`,
    [type, fromYm, toYm, ...f.params],
  );
  return Object.fromEntries(rows.map((r) => [r.ym, r.total]));
}

/** 같은 내역(title)끼리 묶은 합계 */
export interface TitleTotal {
  name: string;
  total: number;
  /** 거래 건수 (할부는 원거래 1건) */
  count: number;
  /** 이 내역에 쓰인 상세들을 ", "로 묶은 것 (최근 것부터, 없으면 '') */
  details: string;
}

/**
 * 기간 내 내역(title)별 합계·건수 (할부는 분할 건 금액 기준). 정렬은 화면에서 한다.
 * 같은 내역의 서로 다른 상세는 details에 묶는다. 예) 뮤지컬 → "시카고, 스위니토드"
 * @param filter 통계 필터
 */
export async function getTitleTotals(
  db: SqlDb,
  type: TxType,
  from: string,
  to: string,
  includeExcluded: boolean,
  filter: StatsFilter = {},
): Promise<TitleTotal[]> {
  const f = filterSql(filter);
  // 내역+상세 단위로 먼저 묶고(한 거래는 상세가 하나라 건수를 더해도 된다), 내역 단위로 다시 합친다
  const rows = await db.all<{ name: string; detail: string; total: number; count: number }>(
    `SELECT COALESCE(NULLIF(trim(l.title), ''), '(내역 없음)') AS name, trim(l.detail) AS detail, SUM(l.amount) AS total,
            COUNT(DISTINCT COALESCE(l.parent_id, l.id)) AS count
     FROM v_ledger l
     WHERE l.type = ? AND l.date BETWEEN ? AND ? ${excludedClause(includeExcluded)} ${f.sql}
     GROUP BY 1, 2
     ORDER BY MAX(l.date) DESC, 2`,
    [type, from, to, ...f.params],
  );
  const byName = new Map<string, { total: number; count: number; details: string[] }>();
  for (const r of rows) {
    const acc = byName.get(r.name) ?? { total: 0, count: 0, details: [] };
    acc.total += r.total;
    acc.count += r.count;
    if (r.detail) acc.details.push(r.detail);
    byName.set(r.name, acc);
  }
  return [...byName].map(([name, a]) => ({ name, total: a.total, count: a.count, details: a.details.join(', ') }));
}

export interface TagTotal {
  name: string;
  total: number;
  count: number;
}

/**
 * 기간 내 태그별 합계 (할부는 분할 건 기준, 태그는 총액 행에서 가져옴).
 * @param query 태그 이름 검색어 (빈 문자열이면 전체)
 */
export async function getTagTotals(
  db: SqlDb,
  type: TxType,
  from: string,
  to: string,
  includeExcluded: boolean,
  query = '',
  filter: StatsFilter = {},
): Promise<TagTotal[]> {
  const f = filterSql(filter);
  return db.all<TagTotal>(
    `SELECT tg.name, SUM(l.amount) AS total, COUNT(DISTINCT COALESCE(l.parent_id, l.id)) AS count
     FROM v_ledger l
     JOIN transaction_tags tt ON tt.transaction_id = COALESCE(l.parent_id, l.id)
     JOIN tags tg ON tg.id = tt.tag_id
     WHERE l.type = ? AND l.date BETWEEN ? AND ? AND tg.name LIKE ? ${excludedClause(includeExcluded)} ${f.sql}
     GROUP BY tg.id ORDER BY total DESC LIMIT 50`,
    [type, from, to, `%${query.replace(/^#/, '').replace(/[%_]/g, '')}%`, ...f.params],
  );
}

/**
 * 저장된 거래 행 수 (복원 전 확인 메시지용).
 */
export async function countTransactions(db: SqlDb): Promise<number> {
  const r = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM transactions');
  return r?.n ?? 0;
}
