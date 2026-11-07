/**
 * 백업·복원 테스트: VACUUM INTO로 만든 백업 파일을 다른 앱 DB에 복원하면 내용이 그대로 옮겨지는지,
 * 예전 버전 백업(표·열 일부 없음), 다른 앱 파일 거부, 실패 시 원래 데이터 유지.
 */
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SqlDb } from '../src/db/adapter';
import { backupFileName, isAppBackup, restoreFromDb } from '../src/db/backup';
import { wrapNodeDb } from '../src/db/nodeAdapter';
import {
  getDailyTotals,
  getDayMarks,
  getSetting,
  getTransactionForEdit,
  saveTransaction,
  setDayMark,
  setSetting,
  type TxInput,
} from '../src/db/queries';
import { initSchema } from '../src/db/schema';

let dir: string;
const opened: Database.Database[] = [];

/** 파일 DB를 열어 SqlDb로 감싼다. */
function open(path: string): SqlDb {
  const raw = new Database(path);
  opened.push(raw);
  return wrapNodeDb(raw);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ab-backup-'));
});
afterEach(() => {
  while (opened.length) opened.pop()!.close();
  rmSync(dir, { recursive: true, force: true });
});

const base: TxInput = {
  type: 'expense',
  date: '2026-11-04',
  time: '12:00',
  amount: 10000,
  title: '점심',
  detail: '',
  memo: '맛있음',
  benefits: [],
  categoryId: null,
  paymentMethodId: null,
  installmentMonths: 1,
  excluded: false,
  tags: ['#점심'],
};

/** 데이터가 든 원본 앱 DB를 만들고 백업 파일로 복사한다. */
async function makeBackup(): Promise<{ backupPath: string; parentId: number }> {
  const src = open(join(dir, 'app.db'));
  await initSchema(src);
  await saveTransaction(src, base);
  const parentId = await saveTransaction(src, { ...base, title: '노트북', amount: 30000, installmentMonths: 3, tags: ['#전자'] });
  await saveTransaction(src, { ...base, type: 'income', title: '월급', amount: 3000000, tags: [] });
  await setDayMark(src, '2026-11-04', '🎉');
  await setSetting(src, 'theme', 'sage');
  const backupPath = join(dir, backupFileName(new Date(2026, 10, 6, 21, 30)));
  await src.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  return { backupPath, parentId };
}

test('백업 파일 이름', () => {
  expect(backupFileName(new Date(2026, 10, 6, 9, 5))).toBe('가계부백업_20261106_0905.db');
});

test('백업 → 다른 DB에 복원하면 내역·할부·태그·이모지·설정이 그대로', async () => {
  const { backupPath, parentId } = await makeBackup();
  const target = open(join(dir, 'other.db'));
  await initSchema(target);
  await saveTransaction(target, { ...base, title: '지워질 내역', tags: [] });

  const summary = await restoreFromDb(open(backupPath), target);
  expect(summary).toMatchObject({ transactions: 5, missingTables: [] }); // 일반 1 + 할부 분할 3 + 수입 1

  expect(await getDailyTotals(target, 'expense', '2026-11', false)).toEqual({ '2026-11-04': 20000 });
  const inst = await getTransactionForEdit(target, parentId);
  expect(inst).toMatchObject({ title: '노트북', amount: 30000, installmentMonths: 3, tags: ['전자'] });
  expect(await getDayMarks(target, '2026-11-01', '2026-11-30')).toEqual({ '2026-11-04': '🎉' });
  expect(await getSetting(target, 'theme')).toBe('sage');
  const titles = await target.all<{ title: string }>('SELECT title FROM transactions');
  expect(titles.map((t) => t.title)).not.toContain('지워질 내역');

  // 복원 후 새로 입력해도 id가 겹치지 않는다 (AUTOINCREMENT 이어감)
  const next = await saveTransaction(target, { ...base, title: '새 내역', tags: [] });
  expect(next).toBeGreaterThan(parentId);
});

test('예전 버전 백업: 없는 표는 비우고, 없는 열은 기본값, 모르는 열은 무시', async () => {
  const { backupPath } = await makeBackup();
  const old = open(backupPath);
  await old.exec('DROP TABLE day_marks');
  await old.exec('ALTER TABLE transactions DROP COLUMN detail');
  await old.exec("ALTER TABLE transactions ADD COLUMN old_note TEXT DEFAULT '옛 열'");

  const target = open(join(dir, 'other.db'));
  await initSchema(target);
  await setDayMark(target, '2026-01-01', '😀');
  const summary = await restoreFromDb(old, target);
  expect(summary.missingTables).toEqual(['day_marks']);
  expect(await getDayMarks(target, '2026-01-01', '2026-12-31')).toEqual({});
  const row = await target.first<{ detail: string; memo: string }>("SELECT detail, memo FROM transactions WHERE title = '점심'");
  expect(row).toEqual({ detail: '', memo: '맛있음' });
});

test('이 앱 백업이 아니면 거부하고 데이터는 그대로', async () => {
  const other = open(join(dir, 'other-app.db'));
  await other.exec('CREATE TABLE notes (_id INTEGER)');
  expect(await isAppBackup(other)).toBe(false);

  const target = open(join(dir, 'app2.db'));
  await initSchema(target);
  await saveTransaction(target, base);
  await expect(restoreFromDb(other, target)).rejects.toThrow('백업 파일이 아닙니다');
  expect(await getDailyTotals(target, 'expense', '2026-11', false)).toEqual({ '2026-11-04': 10000 });
});

test('복원 중 실패하면 원래 데이터가 남는다', async () => {
  const { backupPath } = await makeBackup();
  const broken = open(backupPath);
  // 앱 DB의 CHECK 제약에 걸리는 행을 넣어 중간에 실패하게 한다
  await broken.exec("PRAGMA ignore_check_constraints = ON; UPDATE transactions SET type = 'weird' WHERE title = '월급'");

  const target = open(join(dir, 'app3.db'));
  await initSchema(target);
  await saveTransaction(target, { ...base, title: '원래 내역', tags: [] });
  await expect(restoreFromDb(broken, target)).rejects.toThrow();
  const titles = await target.all<{ title: string }>('SELECT title FROM transactions');
  expect(titles.map((t) => t.title)).toEqual(['원래 내역']);
});
