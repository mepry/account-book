/**
 * 금액 키패드 입력 처리 (화면과 무관한 순수 함수).
 */

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '000' | '0000' | 'back' | 'clear';

/** 입력할 수 있는 최대 자릿수 (1조 미만) */
export const MAX_DIGITS = 12;

/**
 * 키를 눌렀을 때 다음 숫자 문자열. 앞자리 0은 붙지 않고, 최대 자릿수를 넘는 키는 무시한다.
 * @param digits 지금 숫자 (콤마 없음, 빈 문자열 가능)
 * @param key 누른 키
 */
export function applyKey(digits: string, key: KeypadKey): string {
  if (key === 'clear') return '';
  if (key === 'back') return digits.slice(0, -1);
  // 비어 있을 때 0만 누르면 아무것도 안 붙는다 (0원 / 0000원 방지)
  if (digits === '' && /^0+$/.test(key)) return '';
  const next = digits + key;
  return next.length > MAX_DIGITS ? digits : next;
}
