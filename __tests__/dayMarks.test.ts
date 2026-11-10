import { addMarks, joinMarks, parseMarks, toggleMark } from '../src/lib/dayMarks';

describe('parseMarks', () => {
  it('공백으로 나눈다', () => {
    expect(parseMarks('🍿 🍚')).toEqual(['🍿', '🍚']);
  });
  it('공백 없이 붙은 예전 값도 이모지 단위로 나눈다', () => {
    expect(parseMarks('🍿🍚')).toEqual(['🍿', '🍚']);
    expect(parseMarks('🛍️☕')).toEqual(['🛍️', '☕']);
    expect(parseMarks('👨‍👩‍👧🎉')).toEqual(['👨‍👩‍👧', '🎉']);
  });
  it('빈 값·공백은 빈 목록', () => {
    expect(parseMarks('')).toEqual([]);
    expect(parseMarks('  ')).toEqual([]);
    expect(parseMarks(undefined)).toEqual([]);
  });
  it('이모지가 아닌 글자가 섞이면 통째로 하나', () => {
    expect(parseMarks('생일🎂')).toEqual(['생일🎂']);
  });
  it('중복은 하나만', () => {
    expect(parseMarks('🍿 🍿🍚')).toEqual(['🍿', '🍚']);
  });
});

describe('toggleMark / addMarks / joinMarks', () => {
  it('넣고 뺀다', () => {
    expect(toggleMark(['🍿'], '🍚')).toEqual(['🍿', '🍚']);
    expect(toggleMark(['🍿', '🍚'], '🍿')).toEqual(['🍚']);
  });
  it('최대 개수를 넘지 않는다', () => {
    expect(toggleMark(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
    expect(addMarks(['🍿', '🍚'], '🎁🎫')).toEqual(['🍿', '🍚', '🎁']);
  });
  it('저장 값', () => {
    expect(joinMarks(['🍿', '🍚'])).toBe('🍿 🍚');
    expect(joinMarks([])).toBeNull();
  });
});
