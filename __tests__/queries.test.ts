/**
 * 화면용 쿼리 테스트: 할부 저장/수정/삭제, 합계가 총액 행을 이중 집계하지 않는지, 태그/카테고리 통계.
 */
import type { SqlDb } from '../src/db/adapter';
import {
  addBenefitType,
  addCategory,
  countCategoryUsage,
  deleteCategory,
  renameCategory,
  ALL_CATEGORIES,
  deleteTransaction,
  getBenefitTypes,
  getCategoryItems,
  getCategoryTotals,
  getSubcategoryTotals,
  getDailyTotals,
  getDayMarks,
  getSetting,
  getDayItems,
  getCategories,
  getPaymentMethods,
  getMonthInstallments,
  getMonthlyTotals,
  getTagTotals,
  getTitleTotals,
  getTransactionForEdit,
  saveTransaction,
  searchTransactions,
  setDayColor,
  getDayColors,
  type SearchFilter,
  setDayMark,
  setSetting,
  setTransactionExcluded,
  type TxInput,
} from '../src/db/queries';
import { initSchema } from '../src/db/schema';
import { dateQueryToLike, elapsedDays } from '../src/lib/date';
import { formatWon, parseAmount } from '../src/lib/money';
import { openMemoryTarget } from './testDb';

let db: SqlDb;
let close: () => void;

beforeEach(async () => {
  const t = openMemoryTarget();
  db = t.db;
  close = () => t.raw.close();
  await initSchema(db);
});
afterEach(() => close());

const base: TxInput = {
  type: 'expense',
  date: '2026-11-04',
  time: '22:43',
  amount: 10000,
  title: '뮤지컬',
  detail: '베토벤',
  memo: '',
  benefits: [],
  categoryId: null,
  paymentMethodId: null,
  installmentMonths: 1,
  excluded: false,
  tags: ['#뮤지컬', '주연배우', '#주연배우', ' '],
};

test('일시불 저장 + 태그 정리(# 제거, 빈 값·중복 제거)', async () => {
  const id = await saveTransaction(db, base);
  const tx = await getTransactionForEdit(db, id);
  expect(tx?.tags.sort()).toEqual(['뮤지컬', '주연배우'].sort());
  expect(await getDailyTotals(db, 'expense', '2026-11', false)).toEqual({ '2026-11-04': 10000 });
});

test('할부 저장: 총액 행은 합계에서 빠지고 분할 건만 집계', async () => {
  const id = await saveTransaction(db, { ...base, amount: 100000, installmentMonths: 3, date: '2026-01-31' });
  expect(await getMonthlyTotals(db, 'expense', '2026-01', '2026-03', true)).toEqual({
    '2026-01': 33334,
    '2026-02': 33333,
    '2026-03': 33333,
  });
  const feb = await getDayItems(db, 'expense', '2026-02-28');
  expect(feb).toHaveLength(1);
  expect(feb[0]).toMatchObject({ edit_id: id, kind: 'installment_part', installment_seq: 2, tags: expect.any(String) });
  // 태그 통계: 총액 행의 태그가 분할 건 금액에 붙는다
  const tags = await getTagTotals(db, 'expense', '2026-01-01', '2026-12-31', true, '주연배우');
  expect(tags).toEqual([{ name: '주연배우', total: 100000, count: 1 }]);
});

test('할부 수정: 분할 건 id로 불러와도 총액 행이 열리고, 개월 수 변경 시 다시 만든다', async () => {
  const id = await saveTransaction(db, { ...base, amount: 100000, installmentMonths: 3 });
  const parts = await getDayItems(db, 'expense', '2026-12-04');
  const tx = await getTransactionForEdit(db, parts[0].id);
  expect(tx).toMatchObject({ id, amount: 100000, installmentMonths: 3 });

  await saveTransaction(db, { ...tx!, installmentMonths: 2 }, id);
  expect(await getMonthlyTotals(db, 'expense', '2026-11', '2027-02', true)).toEqual({
    '2026-11': 50000,
    '2026-12': 50000,
  });

  // 일시불로 바꾸면 분할 건이 사라진다
  await saveTransaction(db, { ...tx!, installmentMonths: 1 }, id);
  expect(await getMonthlyTotals(db, 'expense', '2026-11', '2027-02', true)).toEqual({ '2026-11': 100000 });
});

test('분할 건 삭제 시 할부 전체 삭제', async () => {
  await saveTransaction(db, { ...base, amount: 30000, installmentMonths: 3 });
  const parts = await getDayItems(db, 'expense', '2027-01-04');
  await deleteTransaction(db, parts[0].id);
  expect(await getMonthlyTotals(db, 'expense', '2026-01', '2027-12', true)).toEqual({});
});

test('제외 토글: 제외 항목은 기본 합계에서 빠진다', async () => {
  await saveTransaction(db, base);
  await saveTransaction(db, { ...base, amount: 5000, excluded: true });
  expect(await getDailyTotals(db, 'expense', '2026-11', false)).toEqual({ '2026-11-04': 10000 });
  expect(await getDailyTotals(db, 'expense', '2026-11', true)).toEqual({ '2026-11-04': 15000 });
});

test('카테고리 통계는 대분류 기준', async () => {
  const cats = await db.all<{ id: number; name: string; parent_id: number | null }>(
    "SELECT id, name, parent_id FROM categories WHERE type = 'expense'",
  );
  const food = cats.find((c) => c.name === '식비')!;
  const meal = cats.find((c) => c.name === '식사/간식' && c.parent_id === food.id)!;
  await saveTransaction(db, { ...base, categoryId: meal.id, amount: 7000 });
  await saveTransaction(db, { ...base, categoryId: food.id, amount: 3000 });
  await saveTransaction(db, { ...base, amount: 1000 });
  expect(await getCategoryTotals(db, 'expense', '2026-11-01', '2026-11-30', true)).toEqual([
    { id: food.id, name: '식비', total: 10000, count: 2 },
    { id: null, name: '미분류', total: 1000, count: 1 },
  ]);
});

test('혜택 여러 개 저장·수정·불러오기, 수입은 저장 안 함', async () => {
  const types = await getBenefitTypes(db);
  expect(types.map((t) => t.name)).toEqual(['카카오포인트', '네이버포인트', '할인쿠폰']);
  const custom = await addBenefitType(db, ' 신세계상품권 ');
  expect(await addBenefitType(db, '신세계상품권')).toBe(custom);

  const id = await saveTransaction(db, {
    ...base,
    benefits: [
      { typeId: types[1].id, amount: 3000 },
      { typeId: custom, amount: 5000 },
    ],
  });
  let tx = await getTransactionForEdit(db, id);
  expect(tx?.benefits).toEqual([
    { typeId: types[1].id, amount: 3000 },
    { typeId: custom, amount: 5000 },
  ]);
  // 혜택은 기록만: 합계는 그대로
  expect(await getDailyTotals(db, 'expense', '2026-11', false)).toEqual({ '2026-11-04': 10000 });

  await saveTransaction(db, { ...tx!, benefits: [{ typeId: types[0].id, amount: 100 }] }, id);
  tx = await getTransactionForEdit(db, id);
  expect(tx?.benefits).toEqual([{ typeId: types[0].id, amount: 100 }]);

  const incomeId = await saveTransaction(db, { ...base, type: 'income', benefits: [{ typeId: types[0].id, amount: 1 }] });
  expect((await getTransactionForEdit(db, incomeId))?.benefits).toEqual([]);

  await deleteTransaction(db, id);
  expect(await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM transaction_benefits')).toEqual({ n: 0 });
});

test('할부 혜택은 총액 행에 붙고, 분할 건 id로 불러와도 보인다', async () => {
  const [kakao] = await getBenefitTypes(db);
  await saveTransaction(db, { ...base, amount: 30000, installmentMonths: 3, benefits: [{ typeId: kakao.id, amount: 900 }] });
  const parts = await getDayItems(db, 'expense', '2026-12-04');
  expect((await getTransactionForEdit(db, parts[0].id))?.benefits).toEqual([{ typeId: kakao.id, amount: 900 }]);
});

test('setTransactionExcluded: 할부는 모든 회차가 함께 바뀐다', async () => {
  await saveTransaction(db, { ...base, amount: 30000, installmentMonths: 3 });
  const parts = await getDayItems(db, 'expense', '2026-12-04');
  await setTransactionExcluded(db, parts[0].id, true);
  expect(await getMonthlyTotals(db, 'expense', '2026-01', '2027-12', false)).toEqual({});
  await setTransactionExcluded(db, parts[0].edit_id, false);
  expect(Object.keys(await getMonthlyTotals(db, 'expense', '2026-01', '2027-12', false))).toHaveLength(3);
});

test('initSchema: 기본 카테고리·혜택 종류를 한 번만 넣고, 다시 돌려도 그대로', async () => {
  const count = async (sql: string): Promise<number> => (await db.first<{ n: number }>(sql))?.n ?? 0;
  const before = [await count('SELECT COUNT(*) AS n FROM categories'), await count('SELECT COUNT(*) AS n FROM benefit_types')];
  await initSchema(db);
  expect([await count('SELECT COUNT(*) AS n FROM categories'), await count('SELECT COUNT(*) AS n FROM benefit_types')]).toEqual(before);
  expect(before[1]).toBeGreaterThan(0);
  const excluded = await db.all<{ name: string }>("SELECT name FROM categories WHERE default_excluded = 1 ORDER BY name");
  expect(excluded.map((c) => c.name)).toEqual(['교통비', '저축']);
});

test('일평균 날 수: 지난 달 전체, 이번 달 오늘까지, 미래 달 0', () => {
  expect(elapsedDays('2026-10', '2026-11-05')).toBe(31);
  expect(elapsedDays('2026-02', '2026-11-05')).toBe(28);
  expect(elapsedDays('2026-11', '2026-11-05')).toBe(5);
  expect(elapsedDays('2026-12', '2026-11-05')).toBe(0);
});

test('날짜 검색어 → LIKE 패턴', () => {
  expect(dateQueryToLike('2026.11.4')).toBe('2026-11-04');
  expect(dateQueryToLike('2026-11-04')).toBe('2026-11-04');
  expect(dateQueryToLike('2026년 3월')).toBe('2026-03-%');
  expect(dateQueryToLike('11/4')).toBe('%-11-04');
  expect(dateQueryToLike('11월 4일')).toBe('%-11-04');
  expect(dateQueryToLike('11월')).toBe('%-11-%');
  expect(dateQueryToLike('2026')).toBe('2026-%');
  expect(dateQueryToLike('뮤지컬')).toBeNull();
});

test('검색: 내역·메모·태그 + 기간 + 카테고리, 할부는 한 건', async () => {
  const cats = await db.all<{ id: number; name: string }>("SELECT id, name FROM categories WHERE type = 'expense'");
  const food = cats.find((c) => c.name === '식비')!;
  const delivery = cats.find((c) => c.name === '배달')!;
  await saveTransaction(db, { ...base, memo: '친구랑 봄', tags: ['스위니토드'] });
  await saveTransaction(db, { ...base, title: '치킨', detail: '', date: '2026-10-02', tags: [], categoryId: delivery.id });
  await saveTransaction(db, { ...base, title: '피자', detail: '', date: '2026-11-03', tags: [], categoryId: food.id });
  await saveTransaction(db, { ...base, title: '노트북', detail: '', tags: [], amount: 30000, installmentMonths: 3 });
  await saveTransaction(db, { ...base, type: 'income', title: '뮤지컬 환불', tags: [] });

  const titles = async (f: SearchFilter) => (await searchTransactions(db, 'expense', f)).map((r) => r.title);
  expect(await titles({ query: '뮤지' })).toEqual(['뮤지컬']); // 내역 (수입은 안 나옴)
  expect(await titles({ query: '친구' })).toEqual(['뮤지컬']); // 메모
  expect(await titles({ query: '#스위니' })).toEqual(['뮤지컬']); // 태그
  expect(await titles({ query: '노트북' })).toEqual(['노트북']); // 할부 총액 행 하나만
  // 카테고리: 대분류를 고르면 소분류까지
  expect(await titles({ categoryId: food.id })).toEqual(['피자', '치킨']);
  expect(await titles({ categoryId: delivery.id })).toEqual(['치킨']);
  // 기간
  expect(await titles({ from: '2026-10-01', to: '2026-10-31' })).toEqual(['치킨']);
  // 조합
  expect(await titles({ categoryId: food.id, from: '2026-11-01', to: '2026-11-30' })).toEqual(['피자']);
  expect(await titles({ query: '치킨', from: '2026-11-01', to: '2026-11-30' })).toEqual([]);
  // 조건이 하나도 없으면 빈 목록
  expect(await titles({ query: '  ' })).toEqual([]);
  expect(await titles({})).toEqual([]);
});

test('날짜 색: 저장·바꾸기·지우기, 기간 조회', async () => {
  await setDayColor(db, '2026-11-02', 'pink');
  await setDayColor(db, '2026-11-03', 'blue');
  await setDayColor(db, '2026-11-02', 'mint'); // 바꾸기
  await setDayColor(db, '2026-11-03', null); // 지우기
  expect(await getDayColors(db, '2026-11-01', '2026-11-30')).toEqual({ '2026-11-02': 'mint' });
});

test('날짜 이모지: 저장·바꾸기·지우기, 기간 조회', async () => {
  await setDayMark(db, '2026-11-05', '🎉');
  await setDayMark(db, '2026-11-30', '🎂');
  await setDayMark(db, '2026-12-01', '⭐');
  await setDayMark(db, '2026-11-05', '😴'); // 바꾸기
  expect(await getDayMarks(db, '2026-11-01', '2026-11-30')).toEqual({ '2026-11-05': '😴', '2026-11-30': '🎂' });
  await setDayMark(db, '2026-11-05', null); // 지우기
  await setDayMark(db, '2026-11-30', '  '); // 빈 값도 지우기
  expect(await getDayMarks(db, '2026-10-01', '2026-12-31')).toEqual({ '2026-12-01': '⭐' });
});

test('앱 설정: 없으면 null, 저장·덮어쓰기', async () => {
  expect(await getSetting(db, 'theme')).toBeNull();
  await setSetting(db, 'theme', 'midnight');
  await setSetting(db, 'theme', 'sage');
  expect(await getSetting(db, 'theme')).toBe('sage');
});

test('금액 표기', () => {
  expect(formatWon(12500)).toBe('12,500원');
  expect(formatWon(0)).toBe('0원');
  expect(parseAmount('1,234,5a6')).toBe(123456);
});

test('이번 달 할부금: 회차·남은 금액, 달력·그날 내역에서는 분할 건 제외', async () => {
  // 30,000원 3개월 → 10,000원씩, 11/04 · 12/04 · 01/04
  const parent = await saveTransaction(db, { ...base, amount: 30000, installmentMonths: 3, title: '노트북' });
  await saveTransaction(db, { ...base, date: '2026-12-04', amount: 5000, title: '커피', tags: [] });

  const dec = await getMonthInstallments(db, 'expense', '2026-12', false);
  expect(dec).toHaveLength(1);
  expect(dec[0]).toMatchObject({
    edit_id: parent,
    title: '노트북',
    amount: 10000,
    installment_seq: 2,
    installment_months: 3,
    total: 30000,
    remaining_amount: 10000,
  });

  const jan = await getMonthInstallments(db, 'expense', '2027-01', false);
  expect(jan[0]).toMatchObject({ installment_seq: 3, remaining_amount: 0 });

  // 달력 칸: 기본은 분할 건 포함, 옵션 주면 제외
  expect(await getDailyTotals(db, 'expense', '2026-12', false)).toEqual({ '2026-12-04': 15000 });
  expect(await getDailyTotals(db, 'expense', '2026-12', false, { skipInstallmentParts: true })).toEqual({
    '2026-12-04': 5000,
  });
  const items = await getDayItems(db, 'expense', '2026-12-04', { skipInstallmentParts: true });
  expect(items.map((i) => i.title)).toEqual(['커피']);

  // 제외 처리하면 미포함 조회에서 빠진다
  await setTransactionExcluded(db, parent, true);
  expect(await getMonthInstallments(db, 'expense', '2026-12', false)).toHaveLength(0);
  expect(await getMonthInstallments(db, 'expense', '2026-12', true)).toHaveLength(1);
});

test('통계: 0원 대분류 포함, 소분류 합계·내역 목록, 제외 항목 빼기', async () => {
  const cats = await getCategories(db, 'expense');
  const top = cats.find((c) => c.parent_id === null && cats.some((x) => x.parent_id === c.id))!;
  const sub = cats.find((c) => c.parent_id === top.id)!;
  await saveTransaction(db, { ...base, categoryId: sub.id, amount: 7000, title: '소분류 건', tags: [] });
  await saveTransaction(db, { ...base, categoryId: top.id, amount: 3000, title: '대분류 건', tags: [] });
  const ex = await saveTransaction(db, { ...base, categoryId: sub.id, amount: 1000, title: '제외 건', tags: [] });
  await setTransactionExcluded(db, ex, true);

  // 내역이 있는 대분류만 나온다 (전체 대분류를 0%로 채우지 않음)
  const totals = await getCategoryTotals(db, 'expense', '2026-11-01', '2026-11-30', false);
  expect(totals).toEqual([{ id: top.id, name: top.name, total: 10000, count: 2 }]);

  const subs = await getSubcategoryTotals(db, 'expense', top.id, '2026-11-01', '2026-11-30', false);
  expect(subs).toEqual([
    { id: sub.id, name: sub.name, total: 7000 },
    { id: top.id, name: top.name, total: 3000 },
  ]);
  const items = await getCategoryItems(db, 'expense', top.id, '2026-11-01', '2026-11-30', false);
  expect(items.map((i) => i.title).sort()).toEqual(['대분류 건', '소분류 건']);
  const all = await getCategoryItems(db, 'expense', top.id, '2026-11-01', '2026-11-30', true);
  expect(all).toHaveLength(3);

  // 총 합계(전체): 카테고리 상관없이 모든 내역 (미분류 포함)
  await saveTransaction(db, { ...base, categoryId: null, amount: 500, title: '미분류 건', tags: [] });
  const everything = await getCategoryItems(db, 'expense', ALL_CATEGORIES, '2026-11-01', '2026-11-30', false);
  expect(everything.map((i) => i.title).sort()).toEqual(['대분류 건', '미분류 건', '소분류 건']);
});

test('통계: 내역은 있지만 0원인 대분류도 포함, 필터(카테고리·결제수단·태그)가 모든 통계에 적용', async () => {
  const cats = await getCategories(db, 'expense');
  const tops = cats.filter((c) => c.parent_id === null);
  const [a, b, z] = tops;
  const pm = (await getPaymentMethods(db))[0];
  await saveTransaction(db, { ...base, categoryId: a.id, amount: 9000, title: 'A', tags: ['#뮤지컬'], paymentMethodId: pm?.id ?? null });
  await saveTransaction(db, { ...base, categoryId: b.id, amount: 1000, title: 'B', tags: [] });
  await saveTransaction(db, { ...base, categoryId: z.id, amount: 0, title: 'Z', tags: [] });
  // 할부도 태그(총액 행)로 걸러져야 한다
  await saveTransaction(db, { ...base, categoryId: b.id, amount: 20000, installmentMonths: 2, title: '할부', tags: ['#뮤지컬'] });

  const all = await getCategoryTotals(db, 'expense', '2026-11-01', '2026-11-30', false);
  expect(all.map((c) => c.id).sort()).toEqual([a.id, b.id, z.id].sort());
  expect(all.find((c) => c.id === z.id)?.total).toBe(0);

  // 검색어 필터: 태그로도 걸린다 (앞의 #은 무시)
  const byTag = await getCategoryTotals(db, 'expense', '2026-11-01', '2026-11-30', false, { keyword: '#뮤지컬' });
  expect(byTag).toEqual(
    expect.arrayContaining([
      { id: a.id, name: a.name, total: 9000, count: 1 },
      // 할부 2개월 중 11월 회차만, 건수는 원거래 1건
      { id: b.id, name: b.name, total: 10000, count: 1 },
    ]),
  );
  expect(byTag).toHaveLength(2);
  const monthly = await getMonthlyTotals(db, 'expense', '2026-11', '2026-12', false, { keyword: '뮤지컬' });
  expect(monthly).toEqual({ '2026-11': 19000, '2026-12': 10000 });

  const byCat = await getCategoryItems(db, 'expense', b.id, '2026-11-01', '2026-11-30', false, { categoryId: b.id });
  expect(byCat.map((i) => i.title).sort()).toEqual(['B', '할부']);

  if (pm) {
    const byPm = await getCategoryTotals(db, 'expense', '2026-11-01', '2026-11-30', false, { paymentMethodId: pm.id });
    expect(byPm).toEqual([{ id: a.id, name: a.name, total: 9000, count: 1 }]);
  }
  const tagTotals = await getTagTotals(db, 'expense', '2026-11-01', '2026-11-30', false, '', { categoryId: a.id });
  expect(tagTotals).toEqual([{ name: '뮤지컬', total: 9000, count: 1 }]);
});

test('검색어 필터: 내역·상세·메모·태그 어디에 있어도 걸리고, 할부는 총액 행 메모로 찾는다', async () => {
  const from = '2026-11-01';
  const to = '2026-12-31';
  await saveTransaction(db, { ...base, title: '올리브영', detail: '', memo: '', tags: [] });
  await saveTransaction(db, { ...base, title: '편의점', detail: '올리브영 근처', memo: '', tags: [] });
  await saveTransaction(db, { ...base, title: '카페', detail: '', memo: '올리브영 들렀다가', tags: [] });
  await saveTransaction(db, { ...base, title: '선물', detail: '', memo: '', tags: ['#올리브영'] });
  await saveTransaction(db, { ...base, title: '무관', detail: '', memo: '', tags: [] });
  // 할부 분할 건에는 메모가 없고 총액 행에만 있다
  await saveTransaction(db, { ...base, title: '청소기', detail: '', memo: '올리브영 상품권', amount: 20000, installmentMonths: 2, tags: [] });

  const rows = await getTitleTotals(db, 'expense', from, to, false, { keyword: '올리브영' });
  expect(rows.map((r) => r.name).sort()).toEqual(['선물', '올리브영', '청소기', '카페', '편의점'].sort());
  // 할부: 분할 건 2개 금액 합, 건수는 원거래 1건
  expect(rows.find((r) => r.name === '청소기')).toMatchObject({ name: '청소기', total: 20000, count: 1 });
  // 빈 검색어는 조건 없음
  expect(await getTitleTotals(db, 'expense', from, to, false, { keyword: '  ' })).toHaveLength(6);
  // % 같은 와일드카드는 무시
  expect(await getTitleTotals(db, 'expense', from, to, false, { keyword: '%' })).toHaveLength(6);
});

test('내역별 합계: 같은 내역끼리 묶고 빈 내역은 (내역 없음)', async () => {
  await saveTransaction(db, { ...base, title: '스타벅스', amount: 4500, tags: [] });
  await saveTransaction(db, { ...base, title: '스타벅스 ', amount: 5000, tags: [] });
  await saveTransaction(db, { ...base, title: '', amount: 1000, tags: [] });
  const rows = await getTitleTotals(db, 'expense', '2026-11-01', '2026-11-30', false);
  expect(rows).toEqual(
    expect.arrayContaining([
      { name: '스타벅스', total: 9500, count: 2, details: '베토벤' },
      { name: '(내역 없음)', total: 1000, count: 1, details: '베토벤' },
    ]),
  );
  expect(rows).toHaveLength(2);
});

test('내역별 합계: 같은 내역의 서로 다른 상세는 최근 것부터 ", "로 묶는다', async () => {
  await saveTransaction(db, { ...base, date: '2026-11-02', detail: '시카고', amount: 50000, tags: [] });
  await saveTransaction(db, { ...base, date: '2026-11-10', detail: '스위니토드', amount: 70000, tags: [] });
  await saveTransaction(db, { ...base, date: '2026-11-05', detail: '시카고 ', amount: 30000, tags: [] });
  await saveTransaction(db, { ...base, date: '2026-11-06', detail: '', amount: 10000, tags: [] });
  await saveTransaction(db, { ...base, title: '카페', detail: '', amount: 4000, tags: [] });
  const rows = await getTitleTotals(db, 'expense', '2026-11-01', '2026-11-30', false);
  expect(rows).toEqual(
    expect.arrayContaining([
      { name: '뮤지컬', total: 160000, count: 4, details: '스위니토드, 시카고' },
      { name: '카페', total: 4000, count: 1, details: '' },
    ]),
  );
  expect(rows).toHaveLength(2);
});

test('카테고리 추가·이름 바꾸기: 같은 단계 이름 중복 막기, 맨 뒤에 붙기', async () => {
  const top = await addCategory(db, 'expense', '  취미  ', null);
  const cats = await getCategories(db, 'expense');
  const t = cats.find((c) => c.id === top)!;
  expect(t).toMatchObject({ name: '취미', parent_id: null, type: 'expense' });
  expect(t.sort).toBe(Math.max(...cats.filter((c) => c.parent_id === null).map((c) => c.sort)));

  const sub = await addCategory(db, 'expense', '보드게임', top);
  await expect(addCategory(db, 'expense', '취미', null)).rejects.toThrow('이미 있습니다');
  await expect(addCategory(db, 'expense', '   ', top)).rejects.toThrow('이름을 입력하세요');
  // 다른 부모·다른 종류면 같은 이름 가능
  await expect(addCategory(db, 'income', '취미', null)).resolves.toBeGreaterThan(0);

  await renameCategory(db, sub, '보드게임 카페');
  expect((await getCategories(db, 'expense')).find((c) => c.id === sub)?.name).toBe('보드게임 카페');
  // 자기 이름 그대로 저장은 괜찮다
  await expect(renameCategory(db, sub, '보드게임 카페')).resolves.toBeUndefined();
});

test('카테고리 삭제: 소분류 거래는 대분류로, 대분류 거래(하위 포함)는 미분류로, 할부 분할 건도 같이', async () => {
  const top = await addCategory(db, 'expense', '취미', null);
  const sub = await addCategory(db, 'expense', '보드게임', top);
  const a = await saveTransaction(db, { ...base, categoryId: sub, title: '소분류 건', tags: [] });
  const inst = await saveTransaction(db, { ...base, categoryId: sub, title: '할부 건', amount: 20000, installmentMonths: 2, tags: [] });
  const b = await saveTransaction(db, { ...base, categoryId: top, title: '대분류 건', tags: [] });
  expect(await countCategoryUsage(db, top)).toBe(3);
  expect(await countCategoryUsage(db, sub)).toBe(2);

  await deleteCategory(db, sub);
  expect((await getTransactionForEdit(db, a))?.categoryId).toBe(top);
  const parts = await db.all<{ category_id: number | null }>('SELECT category_id FROM transactions WHERE parent_id = ?', [inst]);
  expect(parts.every((p) => p.category_id === top)).toBe(true);
  expect((await getCategories(db, 'expense')).some((c) => c.id === sub)).toBe(false);

  const sub2 = await addCategory(db, 'expense', '독서', top);
  const c = await saveTransaction(db, { ...base, categoryId: sub2, title: '하위 건', tags: [] });
  await deleteCategory(db, top);
  for (const id of [a, b, c]) expect((await getTransactionForEdit(db, id))?.categoryId).toBeNull();
  const left = await getCategories(db, 'expense');
  expect(left.some((x) => x.id === top || x.id === sub2)).toBe(false);
  // 거래는 하나도 지워지지 않았다
  expect(await db.first<{ n: number }>("SELECT COUNT(*) AS n FROM transactions WHERE kind != 'installment_part'")).toEqual({ n: 4 });
});
