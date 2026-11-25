/**
 * 금액 키패드 입력 처리 (화면과 무관한 순수 함수).
 */

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '000' | '0000' | 'back' | 'clear';

/** 입력할 수 있는 최대 자릿수 (1조 미만) */
export const MAX_DIGITS = 12;

/**
 * 키를 눌렀을 때 다음 숫자 문자열. 0원은 입력할 수 있지만 앞자리 0은 붙지 않고(00원 / 05원 방지),
 * 최대 자릿수를 넘는 키는 무시한다.
 * @param digits 지금 숫자 (콤마 없음, 빈 문자열 가능)
 * @param key 누른 키
 */
export function applyKey(digits: string, key: KeypadKey): string {
  if (key === 'clear') return '';
  if (key === 'back') return digits.slice(0, -1);
  // 비어 있거나 0일 때: 0 묶음 키는 0 하나, 숫자 키는 0을 대신한다
  if (digits === '' || digits === '0') return /^0+$/.test(key) ? '0' : key;
  const next = digits + key;
  return next.length > MAX_DIGITS ? digits : next;
}
