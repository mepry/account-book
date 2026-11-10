import type { SqlDb } from '../src/db/adapter';
import { getSetting, saveTransaction } from '../src/db/queries';
import { initSchema } from '../src/db/schema';
import { importCardSmsBatch, SMS_LAST_TS_KEY } from '../src/db/smsImport';
import { openMemoryTarget } from './testDb';

let db: SqlDb;

beforeEach(async () => {
  db = openMemoryTarget().db;
  await initSchema(db);
});

/** 2026-11-09 21:00 (한국 시간 기준 테스트라 시간대 영향 없게 낮 시각 사용) */
const AT = new Date(2026, 10, 9, 21, 0).getTime();
const CU = '[신한체크승인] 한*현(1111) 11/09 20:15 (금액)1,950원 씨유(CU)관악뉴포레점';

const rows = () =>
  db.all<{ title: string; amount: number; date: string; time: string; memo: string; category_id: number | null; payment_method_id: number | null; excluded: number }>(
    "SELECT title, amount, date, time, memo, category_id, payment_method_id, excluded FROM transactions WHERE kind != 'installment_part' ORDER BY id",
  );

test('승인 문자를 지출로 넣고, 같은 문자는 한 번만', async () => {
  const r1 = await importCardSmsBatch(db, [{ body: CU, date: AT }]);
  const r2 = await importCardSmsBatch(db, [{ body: `[Web발신]\n${CU}`, date: AT + 1000 }]);
  expect(r1).toEqual({ added: 1, cancelled: 0 });
  expect(r2).toEqual({ added: 0, cancelled: 0 });
  expect(await rows()).toMatchObject([{ title: '씨유(CU)관악뉴포레점', amount: 1950, date: '2026-11-09', time: '20:15' }]);
  expect(await getSetting(db, SMS_LAST_TS_KEY)).toBe(String(AT + 1000));
});

test('해외 결제는 환율로 환산하고 메모에 원래 금액을 남긴다', async () => {
  await importCardSmsBatch(db, [{ body: '[Web발신]\n삼성2222해외승인 한*현\nUSD 22.00\n11/09 20:12 ANTHROPIC*CLAUDE', date: AT }]);
  expect(await rows()).toMatchObject([{ title: 'ANTHROPIC*CLAUDE', amount: 30800, memo: 'USD 22.00 (환율 1400 적용)' }]);
});

test('같은 가맹점의 지난 카테고리·기본 제외, 카드 결제수단을 채운다', async () => {
  const transport = await db.first<{ id: number }>("SELECT id FROM categories WHERE name = '대중교통'");
  await db.run("INSERT INTO payment_methods (name, sort) VALUES ('삼성카드', 5), ('신한체크', 6)");
  const shinhan = await db.first<{ id: number }>("SELECT id FROM payment_methods WHERE name = '신한체크'");
  await saveTransaction(db, {
    type: 'expense', date: '2026-11-01', time: '09:00', amount: 1500, title: '씨유(CU)관악뉴포레점', detail: '', memo: '',
    benefits: [], categoryId: transport!.id, paymentMethodId: null, installmentMonths: 1, excluded: false, tags: [],
  });
  await importCardSmsBatch(db, [{ body: CU, date: AT }]);
  const last = (await rows()).at(-1)!;
  expect(last.category_id).toBe(transport!.id);
  expect(last.excluded).toBe(1); // 교통비는 기본 제외 대분류
  expect(last.payment_method_id).toBe(shinhan!.id);
});

test('취소 문자는 자동으로 넣은 같은 내역을 지운다', async () => {
  await importCardSmsBatch(db, [{ body: CU, date: AT }]);
  const r = await importCardSmsBatch(db, [
    { body: CU.replace('승인', '취소').replace('20:15', '20:40'), date: AT + 60000 },
  ]);
  expect(r).toEqual({ added: 0, cancelled: 1 });
  expect(await rows()).toEqual([]);
});

test('카드 문자가 아니면 무시', async () => {
  expect(await importCardSmsBatch(db, [{ body: '인증번호 123456', date: AT }])).toEqual({ added: 0, cancelled: 0 });
});
