/**
 * 카드 결제 문자 → 지출 내역 자동 추가.
 * 같은 문자는 sms_imports 표로 한 번만 넣고, 취소 문자는 앞서 자동으로 넣은 같은 금액·가맹점 내역을 지운다.
 */
import { DEFAULT_FX_RATES, parseCardSms, resolveSmsDate, toWon, type CardSms } from '../lib/cardSms';
import type { SqlDb } from './adapter';
import { deleteTransaction, getSetting, saveTransaction, setSetting } from './queries';

/** 자동 추가 켜기/끄기 설정 키 ('1' = 켬) */
export const SMS_AUTO_KEY = 'sms_auto_import';
/** 마지막으로 확인한 문자 시각(ms) 설정 키 */
export const SMS_LAST_TS_KEY = 'sms_last_ts';
/** 해외 결제 환율(JSON) 설정 키 */
export const FX_RATES_KEY = 'fx_rates';

/** 받은 문자 한 건 */
export interface IncomingSms {
  body: string;
  /** 받은 시각 (ms) */
  date: number;
}

export type ImportResult = 'added' | 'cancelled' | 'duplicate' | 'ignored';

/**
 * 해외 결제 환율 표 (설정값 없으면 기본값).
 * @param db DB
 */
export async function getFxRates(db: SqlDb): Promise<Record<string, number>> {
  const raw = await getSetting(db, FX_RATES_KEY);
  if (!raw) return { ...DEFAULT_FX_RATES };
  try {
    return { ...DEFAULT_FX_RATES, ...(JSON.parse(raw) as Record<string, number>) };
  } catch {
    return { ...DEFAULT_FX_RATES };
  }
}

/**
 * 해외 결제 환율 표를 저장한다.
 * @param db DB
 * @param rates 환율 표
 */
export async function setFxRates(db: SqlDb, rates: Record<string, number>): Promise<void> {
  await setSetting(db, FX_RATES_KEY, JSON.stringify(rates));
}

/** 같은 문자인지 가리는 키 (공백 차이는 무시) */
const smsKey = (body: string): string => body.replace(/\[Web발신\]/g, '').replace(/\s+/g, ' ').trim();

/**
 * 받은 시각(ms)을 기기 시간대 기준 YYYY-MM-DD로 바꾼다.
 * @param ms 시각
 */
function localYmd(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 카드에 맞는 결제수단을 찾는다: 끝 4자리 → 카드사+체크/카드 → 카드사 순서. 없으면 null.
 * @param db DB
 * @param sms 해석한 문자
 */
async function findPaymentMethod(db: SqlDb, sms: CardSms): Promise<number | null> {
  const methods = await db.all<{ id: number; name: string }>('SELECT id, name FROM payment_methods ORDER BY hidden, sort, id');
  const names = sms.company === '농협' ? ['농협', 'NH'] : [sms.company];
  const ofCompany = methods.filter((m) => names.some((n) => m.name.includes(n)));
  return (
    (sms.last4 ? methods.find((m) => m.name.includes(sms.last4!)) : undefined)?.id ??
    ofCompany.find((m) => m.name.includes('체크') === sms.check)?.id ??
    ofCompany[0]?.id ??
    null
  );
}

/**
 * 같은 가맹점의 지난번 카테고리와, 그 카테고리의 "기본 제외" 여부.
 * @param db DB
 * @param title 가맹점(내역)
 */
async function guessCategory(db: SqlDb, title: string): Promise<{ categoryId: number | null; excluded: boolean }> {
  const row = await db.first<{ category_id: number | null; flag: number | null }>(
    `SELECT t.category_id,
            MAX(COALESCE(c.default_excluded, 0), COALESCE(pc.default_excluded, 0)) AS flag
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN categories pc ON pc.id = c.parent_id
     WHERE t.type = 'expense' AND t.kind != 'installment_part' AND t.title = ? AND t.category_id IS NOT NULL
     ORDER BY t.date DESC, t.time DESC, t.id DESC LIMIT 1`,
    [title],
  );
  return { categoryId: row?.category_id ?? null, excluded: row?.flag === 1 };
}

/**
 * 카드 문자 한 건을 반영한다.
 * @param db DB
 * @param msg 받은 문자
 * @param rates 해외 결제 환율 표
 * @returns 추가됨 / 취소 반영 / 이미 넣은 문자 / 카드 문자 아님
 */
export async function importCardSms(db: SqlDb, msg: IncomingSms, rates: Record<string, number>): Promise<ImportResult> {
  const sms = parseCardSms(msg.body);
  if (!sms) return 'ignored';
  const key = smsKey(msg.body);
  if (await db.first('SELECT 1 FROM sms_imports WHERE key = ?', [key])) return 'duplicate';

  const date = resolveSmsDate(sms.month, sms.day, localYmd(msg.date));
  const amount = sms.amount ?? (sms.currency && sms.foreignAmount !== null ? toWon(sms.currency, sms.foreignAmount, rates) : null);
  let transactionId: number | null = null;
  let result: ImportResult;

  if (sms.kind === 'cancel') {
    // 자동으로 넣은 내역 중 같은 금액·가맹점의 가장 최근 것을 지운다 (못 찾으면 그냥 넘어간다)
    const target = await db.first<{ id: number }>(
      `SELECT t.id FROM sms_imports s JOIN transactions t ON t.id = s.transaction_id
       WHERE t.title = ? AND (t.amount = ? OR ? IS NULL) AND t.date <= ?
       ORDER BY t.date DESC, t.time DESC LIMIT 1`,
      [sms.merchant, amount, sms.amount, date],
    );
    if (target) await deleteTransaction(db, target.id);
    result = 'cancelled';
  } else {
    const { categoryId, excluded } = await guessCategory(db, sms.merchant);
    const foreignMemo =
      sms.currency && sms.foreignAmount !== null
        ? `${sms.currency} ${sms.foreignAmount.toFixed(2)}${rates[sms.currency] ? ` (환율 ${rates[sms.currency]} 적용)` : ' (환율 없음, 금액 직접 입력)'}`
        : '';
    transactionId = await saveTransaction(db, {
      type: 'expense',
      date,
      time: sms.time,
      amount: amount ?? 0,
      title: sms.merchant,
      detail: '',
      memo: foreignMemo,
      benefits: [],
      categoryId,
      paymentMethodId: await findPaymentMethod(db, sms),
      installmentMonths: sms.installmentMonths,
      excluded,
      tags: [],
    });
    result = 'added';
  }
  await db.run('INSERT INTO sms_imports (key, transaction_id, received_at) VALUES (?, ?, ?)', [
    key,
    transactionId,
    new Date(msg.date).toISOString(),
  ]);
  return result;
}

/**
 * 받은 문자들을 반영하고 마지막 확인 시각을 저장한다.
 * @param db DB
 * @param messages 받은 문자 (순서 무관)
 * @returns 추가된 건수와 취소 반영 건수
 */
export async function importCardSmsBatch(db: SqlDb, messages: IncomingSms[]): Promise<{ added: number; cancelled: number }> {
  const rates = await getFxRates(db);
  let added = 0;
  let cancelled = 0;
  let lastTs = Number((await getSetting(db, SMS_LAST_TS_KEY)) ?? 0);
  for (const msg of [...messages].sort((a, b) => a.date - b.date)) {
    const r = await importCardSms(db, msg, rates);
    if (r === 'added') added++;
    if (r === 'cancelled') cancelled++;
    lastTs = Math.max(lastTs, msg.date);
  }
  await setSetting(db, SMS_LAST_TS_KEY, String(lastTs));
  return { added, cancelled };
}
