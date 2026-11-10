/**
 * 카드 결제 문자 해석 (화면·DB와 무관한 순수 함수).
 * 신한·삼성·현대·농협 승인/취소 문자에서 금액·날짜·시간·가맹점·할부·카드를 뽑는다.
 * 카드사마다 형식이 조금씩 달라서, 정해진 형식 대신 "날짜 시간 줄"과 "금액"을 기준으로 찾는다.
 */

export type CardCompany = '신한' | '삼성' | '현대' | '농협';

export interface CardSms {
  kind: 'approve' | 'cancel';
  company: CardCompany;
  /** 체크카드 여부 */
  check: boolean;
  /** 카드 끝 4자리 (없으면 null) */
  last4: string | null;
  month: number;
  day: number;
  /** HH:MM */
  time: string;
  /** 원화 금액 (해외 결제처럼 원화가 없으면 null) */
  amount: number | null;
  /** 해외 결제 통화 (예: USD). 원화 결제면 null */
  currency: string | null;
  /** 해외 결제 금액 (예: 22.00) */
  foreignAmount: number | null;
  /** 1 = 일시불, 2~ = 할부 개월 */
  installmentMonths: number;
  /** 가맹점 (못 찾으면 '카드결제') */
  merchant: string;
}

const COMPANIES: [RegExp, CardCompany][] = [
  [/신한/, '신한'],
  [/삼성/, '삼성'],
  [/현대/, '현대'],
  [/농협|NH/, '농협'],
];

/** 해외 결제 통화 코드 */
const CURRENCIES = 'USD|JPY|EUR|CNY|GBP|HKD|SGD|AUD|CAD|THB|VND|TWD|PHP|CHF';
const FOREIGN_RE = new RegExp(`\\b(${CURRENCIES})\\s*([\\d,]+(?:\\.\\d+)?)`);
/** 승인이 안 된 문자 (넣지 않는다) */
const REJECT_RE = /거절|미승인|한도초과|잔액부족|승인불가/;
const DATETIME_RE = /(\d{1,2})\/(\d{1,2})\s*(\d{1,2}):(\d{2})/;
/** 금액 아닌 원 단위 숫자 앞에 붙는 말 (누적·잔액 등) */
const NOT_AMOUNT_RE = /(누적|잔액|한도|포인트|적립)[^\n\d]*$/;
/** 가맹점 줄로 보지 않는 줄 */
const SKIP_LINE_RE = /^(누적|총누적|잔액|한도|포인트|적립|일시불|\d+개월)|^[가-힣A-Za-z]\*[가-힣A-Za-z*]*님?$/;

/**
 * 원 단위 금액을 찾는다 (누적·잔액 금액은 건너뛴다).
 * @param text 문자 본문
 */
function findWon(text: string): number | null {
  const re = /([\d,]+)\s*원/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (NOT_AMOUNT_RE.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * 가맹점 이름에서 금액·할부 같은 군더더기를 지운다.
 * @param s 후보 문자열
 */
function cleanMerchant(s: string): string {
  return s
    .replace(/\(금액\)/g, '')
    .replace(/[\d,]+\s*원/g, '')
    .replace(new RegExp(`\\b(${CURRENCIES})\\s*[\\d,]+(?:\\.\\d+)?`, 'g'), '')
    .replace(/일시불|\d{1,2}\s*개월/g, '')
    .replace(/(총?누적|잔액).*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 카드 결제 문자를 해석한다. 카드 결제 문자가 아니거나 승인되지 않은 문자면 null.
 * @param body 문자 본문
 */
export function parseCardSms(body: string): CardSms | null {
  const lines = body
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\[Web발신\]/g, '').trim())
    .filter(Boolean);
  const text = lines.join('\n');
  const company = COMPANIES.find(([re]) => re.test(text))?.[1];
  if (!company) return null;
  if (!/승인|취소/.test(text) || REJECT_RE.test(text)) return null;

  const dtLineIndex = lines.findIndex((l) => DATETIME_RE.test(l));
  if (dtLineIndex < 0) return null;
  const dtLine = lines[dtLineIndex];
  const dt = DATETIME_RE.exec(dtLine)!;
  const month = parseInt(dt[1], 10);
  const day = parseInt(dt[2], 10);
  const hour = parseInt(dt[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23) return null;

  const amount = findWon(text);
  const foreign = FOREIGN_RE.exec(text);
  if (amount === null && !foreign) return null;

  // 가맹점: 날짜·시간 뒤에 같은 줄로 이어지면 그것, 아니면 다음 줄들 중 첫 후보
  let merchant = cleanMerchant(dtLine.slice(dt.index + dt[0].length));
  for (let i = dtLineIndex + 1; !merchant && i < lines.length; i++) {
    if (SKIP_LINE_RE.test(lines[i])) continue;
    merchant = cleanMerchant(lines[i]);
  }

  const months = /(\d{1,2})\s*개월/.exec(text);
  const last4 =
    /\((\d{4})\)/.exec(text)?.[1] ?? /(?:신한|삼성|현대|농협|NH)[가-힣A-Za-z]*?(\d{4})/.exec(text)?.[1] ?? null;

  return {
    kind: /취소/.test(text) ? 'cancel' : 'approve',
    company,
    check: /체크/.test(text),
    last4,
    month,
    day,
    time: `${String(hour).padStart(2, '0')}:${dt[4]}`,
    amount,
    currency: amount === null && foreign ? foreign[1] : null,
    foreignAmount: amount === null && foreign ? parseFloat(foreign[2].replace(/,/g, '')) : null,
    installmentMonths: months ? Math.min(24, Math.max(1, parseInt(months[1], 10))) : 1,
    merchant: merchant || '카드결제',
  };
}

/**
 * 문자에는 월/일만 있으므로 받은 날짜 기준으로 연도를 정한다.
 * 받은 날보다 미래 날짜면(예: 1월 1일에 받은 12/31 문자) 작년으로 본다.
 * @param month 월
 * @param day 일
 * @param received 문자 받은 날짜 YYYY-MM-DD
 * @returns YYYY-MM-DD
 */
export function resolveSmsDate(month: number, day: number, received: string): string {
  const year = parseInt(received.slice(0, 4), 10);
  const md = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return `${md > received.slice(5) ? year - 1 : year}-${md}`;
}

/** 해외 결제 환산 기본 환율 (1단위당 원). 설정에서 바꿀 수 있다. */
export const DEFAULT_FX_RATES: Record<string, number> = { USD: 1400, JPY: 9.5, EUR: 1500 };

/**
 * 해외 결제 금액을 원화로 환산한다. 환율을 모르면 null.
 * @param currency 통화 코드
 * @param foreignAmount 해외 금액
 * @param rates 환율 표
 */
export function toWon(currency: string, foreignAmount: number, rates: Record<string, number>): number | null {
  const rate = rates[currency];
  return rate ? Math.round(foreignAmount * rate) : null;
}
