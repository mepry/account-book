/**
 * 예산 탭 데이터: 월별 고정지출·예산(카테고리별 금액)과 그 달 실제 사용액.
 * 할부금은 따로 저장하지 않고 지출에 입력한 할부 분할 건(getMonthInstallments)을 그대로 쓴다.
 */
import type { SqlDb } from './adapter';

export type BudgetKind = 'fixed' | 'budget';

export interface BudgetItem {
  id: number;
  ym: string;
  kind: BudgetKind;
  category_id: number;
  /** "대분류 > 소분류" 또는 대분류 이름 */
  category: string;
  /** 계획 금액 */
  amount: number;
  /** 그 달 실제 사용액 (통계 제외 항목 포함, 할부 분할 건 제외) */
  spent: number;
}

/**
 * 한 달의 고정지출·예산 목록과 사용액.
 * 대분류 항목의 사용액에는 소분류 지출도 들어가지만, 같은 달에 따로 항목이 있는 소분류는 빼서 두 번 세지 않는다.
 * @param db DB
 * @param ym YYYY-MM
 */
export async function getBudgetItems(db: SqlDb, ym: string): Promise<BudgetItem[]> {
  return db.all<BudgetItem>(
    `SELECT b.id, b.ym, b.kind, b.category_id, b.amount,
            CASE WHEN pc.name IS NULL THEN c.name ELSE pc.name || ' > ' || c.name END AS category,
            (SELECT COALESCE(SUM(l.amount), 0) FROM v_ledger l
              WHERE l.type = 'expense' AND l.kind != 'installment_part' AND l.date LIKE ?
                AND (l.category_id = b.category_id
                     OR (l.category_id IN (SELECT id FROM categories WHERE parent_id = b.category_id)
                         AND l.category_id NOT IN (SELECT category_id FROM budget_items WHERE ym = b.ym)))) AS spent
     FROM budget_items b
     JOIN categories c ON c.id = b.category_id
     LEFT JOIN categories pc ON pc.id = c.parent_id
     WHERE b.ym = ?
     ORDER BY b.kind, b.sort, COALESCE(pc.sort, c.sort), c.sort, b.id`,
    [`${ym}-%`, ym],
  );
}

/**
 * 고정지출·예산 항목을 저장한다. 같은 달에 같은 카테고리가 이미 있으면 그 항목을 바꾼다 (종류도 바뀜).
 * @param db DB
 * @param item 저장할 값 (id가 있으면 그 항목 수정)
 * @returns 저장된 항목 id
 */
export async function saveBudgetItem(
  db: SqlDb,
  item: { id?: number; ym: string; kind: BudgetKind; categoryId: number; amount: number },
): Promise<number> {
  let id = 0;
  await db.transaction(async () => {
    // 카테고리를 바꿔 저장하면 원래 항목은 지우고, 새 카테고리 자리에 넣는다
    // (수정이면 원래 순서를 그대로 쓴다)
    const old = item.id !== undefined ? await db.first<{ sort: number }>('SELECT sort FROM budget_items WHERE id = ?', [item.id]) : null;
    if (item.id !== undefined) await db.run('DELETE FROM budget_items WHERE id = ?', [item.id]);
    const next = await db.first<{ n: number }>('SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM budget_items WHERE ym = ?', [item.ym]);
    const sort = old?.sort ?? next?.n ?? 0;
    await db.run(
      `INSERT INTO budget_items (ym, kind, category_id, amount, sort) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(ym, category_id) DO UPDATE SET kind = excluded.kind, amount = excluded.amount`,
      [item.ym, item.kind, item.categoryId, item.amount, sort],
    );
    id = (await db.first<{ id: number }>('SELECT id FROM budget_items WHERE ym = ? AND category_id = ?', [item.ym, item.categoryId]))!.id;
  });
  return id;
}

/**
 * 항목을 지운다.
 * @param db DB
 * @param id 항목 id
 */
export async function deleteBudgetItem(db: SqlDb, id: number): Promise<void> {
  await db.run('DELETE FROM budget_items WHERE id = ?', [id]);
}

/**
 * 이 달보다 앞에서 해당 종류 항목이 있는 가장 최근 달. 없으면 null.
 * @param db DB
 * @param ym 기준 달 YYYY-MM
 * @param kind 고정지출/예산
 */
export async function findPreviousBudgetMonth(db: SqlDb, ym: string, kind: BudgetKind): Promise<string | null> {
  const row = await db.first<{ ym: string }>('SELECT MAX(ym) AS ym FROM budget_items WHERE ym < ? AND kind = ?', [ym, kind]);
  return row?.ym ?? null;
}

/**
 * 다른 달의 항목을 이 달로 가져온다. 이 달에 이미 있는 카테고리는 건너뛴다.
 * @param db DB
 * @param fromYm 가져올 달
 * @param toYm 넣을 달
 * @param kind 고정지출/예산
 * @returns 가져온 개수
 */
export async function copyBudgetItems(db: SqlDb, fromYm: string, toYm: string, kind: BudgetKind): Promise<number> {
  const r = await db.run(
    `INSERT OR IGNORE INTO budget_items (ym, kind, category_id, amount, sort)
     SELECT ?, kind, category_id, amount, sort FROM budget_items WHERE ym = ? AND kind = ?`,
    [toYm, fromYm, kind],
  );
  return r.changes;
}
