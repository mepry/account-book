/**
 * 금액 키패드 테스트: 00/000/0000 한 번에 입력, 앞자리 0 방지, 지우기, 최대 자릿수.
 */
import { applyKey, MAX_DIGITS, type KeypadKey } from '../src/lib/keypad';

const press = (...keys: KeypadKey[]): string => keys.reduce((d, k) => applyKey(d, k), '');

test('0 묶음 키로 한 번에 입력', () => {
  expect(press('5', '00')).toBe('500');
  expect(press('5', '000')).toBe('5000');
  expect(press('5', '0000')).toBe('50000');
  expect(press('1', '2', '0000')).toBe('120000');
});

test('비어 있을 때 0 키는 무시, 지우기·모두 지우기', () => {
  expect(press('0', '00', '000', '0000')).toBe('');
  expect(press('3', '0', 'back')).toBe('3');
  expect(press('3', '0000', 'clear')).toBe('');
  expect(press('back')).toBe('');
});

test('최대 자릿수를 넘는 키는 무시', () => {
  const full = '9'.repeat(MAX_DIGITS);
  expect(applyKey(full, '1')).toBe(full);
  expect(applyKey('9'.repeat(MAX_DIGITS - 2), '000')).toBe('9'.repeat(MAX_DIGITS - 2));
  expect(applyKey('9'.repeat(MAX_DIGITS - 2), '00')).toBe(`${'9'.repeat(MAX_DIGITS - 2)}00`);
});
