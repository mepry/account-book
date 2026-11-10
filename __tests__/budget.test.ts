import type { SqlDb } from '../src/db/adapter';
import {
  copyBudgetItems,
  deleteBudgetItem,
  findPreviousBudgetMonth,
  getBudgetItems,
  saveBudgetItem,
} from '../src/db/budget';
import { deleteCategory, saveTransaction, suggestCategories, type TxInput } from '../src/db/queries';
import { initSchema } from '../src/db/schema';
import { openMemoryTarget } from './testDb';

let db: SqlDb;
let cat: Record<string, number>;

const tx = (over: Partial<TxInput>): TxInput => ({
  type: 'expense',
  date: '2026-11-04',
  time: '12:00',
  amount: 10000,
  title: '점심',
  detail: '',
  memo: '',
  benefits: [],
  categoryId: null,
  paymentMethodId: null,
  installmentMonths: 1,
  excluded: false,
  tags: [],
  ...over,
});

beforeEach(async () => {
  db = openMemoryTarget().db;
  await initSchema(db);
  const rows = await db.all<{ id: number; name: string }>("SELECT id, name FROM categories WHERE type = 'expense'");
  cat = Object.fromEntries(rows.map((r) => [r.name, r.id]));
});

test('사용액: 제외 항목 포함, 할부 분할 건 제외, 대분류는 소분류 포함', async () => {
  await saveTransaction(db, tx({ categoryId: cat['대중교통'], amount: 1500, excluded: true }));
  await saveTransaction(db, tx({ categoryId: cat['교통비'], amount: 3000 }));
  await saveTransaction(db, tx({ categoryId: cat['교통비'], amount: 99999, date: '2026-10-31' })); // 다른 달
  await saveTransaction(db, tx({ categoryId: cat['영화/공연'], amount: 120000, installmentMonths: 3 })); // 할부
  await saveBudgetItem(db, { ym: '2026-11', kind: 'fixed', categoryId: cat['교통비'], amount: 100000 });
  await saveBudgetItem(db, { ym: '2026-11', kind: 'budget', categoryId: cat['문화생활비'], amount: 50000 });
  const items = await getBudgetItems(db, '2026-11');
  expect(items.map((i) => [i.kind, i.category, i.amount, i.spent])).toEqual([
    ['budget', '문화생활비', 50000, 0],
    ['fixed', '교통비', 100000, 4500],
  ]);
});

test('대분류와 소분류가 둘 다 있으면 소분류 지출은 소분류에만', async () => {
  await saveTransaction(db, tx({ categoryId: cat['택시'], amount: 8000 }));
  await saveTransaction(db, tx({ categoryId: cat['대중교통'], amount: 1500 }));
  await saveBudgetItem(db, { ym: '2026-11', kind: 'fixed', categoryId: cat['교통비'], amount: 100000 });
  await saveBudgetItem(db, { ym: '2026-11', kind: 'budget', categoryId: cat['택시'], amount: 20000 });
  const spent = Object.fromEntries((await getBudgetItems(db, '2026-11')).map((i) => [i.category, i.spent]));
  expect(spent).toEqual({ 교통비: 1500, '교통비 > 택시': 8000 });
});

test('수정·삭제, 같은 카테고리는 한 달에 하나', async () => {
  const id = await saveBudgetItem(db, { ym: '2026-11', kind: 'budget', categoryId: cat['식비'], amount: 300000 });
  await saveBudgetItem(db, { id, ym: '2026-11', kind: 'budget', categoryId: cat['식비'], amount: 250000 });
  await saveBudgetItem(db, { ym: '2026-11', kind: 'fixed', categoryId: cat['식비'], amount: 200000 }); // 같은 카테고리 → 바뀜
  expect((await getBudgetItems(db, '2026-11')).map((i) => [i.kind, i.amount])).toEqual([['fixed', 200000]]);
  const [only] = await getBudgetItems(db, '2026-11');
  await deleteBudgetItem(db, only.id);
  expect(await getBudgetItems(db, '2026-11')).toEqual([]);
});

test('지난 고정지출 가져오기: 가장 최근 달에서, 이미 있는 카테고리는 건너뜀', async () => {
  await saveBudgetItem(db, { ym: '2026-09', kind: 'fixed', categoryId: cat['교통비'], amount: 100000 });
  await saveBudgetItem(db, { ym: '2026-09', kind: 'fixed', categoryId: cat['선물/용돈'], amount: 200000 });
  await saveBudgetItem(db, { ym: '2026-09', kind: 'budget', categoryId: cat['식비'], amount: 1 });
  await saveBudgetItem(db, { ym: '2026-11', kind: 'fixed', categoryId: cat['교통비'], amount: 90000 });
  const from = await findPreviousBudgetMonth(db, '2026-11', 'fixed');
  expect(from).toBe('2026-09');
  expect(await copyBudgetItems(db, from!, '2026-11', 'fixed')).toBe(1);
  expect((await getBudgetItems(db, '2026-11')).map((i) => [i.category, i.amount])).toEqual([
    ['교통비', 90000],
    ['사회생활비 > 선물/용돈', 200000],
  ]);
  expect(await findPreviousBudgetMonth(db, '2026-09', 'fixed')).toBeNull();
});

test('카테고리를 지우면 그 항목도 지워진다', async () => {
  await saveBudgetItem(db, { ym: '2026-11', kind: 'fixed', categoryId: cat['택시'], amount: 1 });
  await deleteCategory(db, cat['택시']);
  expect(await getBudgetItems(db, '2026-11')).toEqual([]);
});

test('카테고리 추천: 같은 내역에 썼던 것 먼저, 없으면 최근 많이 쓴 것', async () => {
  await saveTransaction(db, tx({ title: '스타벅스', categoryId: cat['음료'] }));
  await saveTransaction(db, tx({ title: '스타벅스', categoryId: cat['음료'] }));
  await saveTransaction(db, tx({ title: '스타벅스', categoryId: cat['배달'] }));
  await saveTransaction(db, tx({ title: '김밥', categoryId: cat['식사/간식'] }));
  await saveTransaction(db, tx({ title: '김밥', categoryId: cat['식사/간식'], date: '2026-01-01' })); // 90일 전
  expect(await suggestCategories(db, 'expense', '스타벅스', '2026-11-10')).toEqual({
    byTitle: true,
    items: [
      { id: cat['음료'], count: 2 },
      { id: cat['배달'], count: 1 },
    ],
  });
  const recent = await suggestCategories(db, 'expense', '처음 보는 가게', '2026-11-10');
  expect(recent.byTitle).toBe(false);
  expect(recent.items[0]).toEqual({ id: cat['음료'], count: 2 });
});

test('통계: 하위카테고리별·결제수단별 합계와 조각 상세 필터', async () => {
  const {
    getMinorCategoryTotals,
    getPaymentTotals,
    getCategoryItems,
    ALL_CATEGORIES,
    NO_PAYMENT_METHOD,
  } = await import('../src/db/queries');
  const card = await db.first<{ id: number }>("SELECT id FROM payment_methods WHERE name = '카드'");
  await saveTransaction(db, tx({ categoryId: cat['배달'], amount: 20000, paymentMethodId: card!.id }));
  await saveTransaction(db, tx({ categoryId: cat['식비'], amount: 5000 })); // 대분류에 바로
  await saveTransaction(db, tx({ categoryId: null, amount: 1000 }));
  await saveTransaction(db, tx({ categoryId: cat['영화/공연'], amount: 90000, installmentMonths: 3, paymentMethodId: card!.id }));

  const minors = await getMinorCategoryTotals(db, 'expense', '2026-11-01', '2026-11-30', true);
  expect(minors.map((m) => [m.name, m.total])).toEqual([
    ['문화생활비 > 영화/공연', 30000], // 할부는 이번 달 분할 건
    ['식비 > 배달', 20000],
    ['식비', 5000],
    ['미분류', 1000],
  ]);
  const pays = await getPaymentTotals(db, 'expense', '2026-11-01', '2026-11-30', true);
  expect(pays.map((p) => [p.name, p.total])).toEqual([
    ['카드', 50000],
    ['결제수단 없음', 6000],
  ]);
  // 조각 상세: 대분류에 바로 붙은 내역만 / 결제수단 없는 내역만
  const exact = await getCategoryItems(db, 'expense', ALL_CATEGORIES, '2026-11-01', '2026-11-30', true, { exactCategoryId: cat['식비'] });
  expect(exact.map((i) => i.amount)).toEqual([5000]);
  const none = await getCategoryItems(db, 'expense', ALL_CATEGORIES, '2026-11-01', '2026-11-30', true, {
    paymentMethodId: NO_PAYMENT_METHOD,
  });
  expect(none.map((i) => i.amount).sort((a, b) => a - b)).toEqual([1000, 5000]);
});
