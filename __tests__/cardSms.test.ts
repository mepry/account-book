import { parseCardSms, resolveSmsDate, toWon } from '../src/lib/cardSms';

describe('parseCardSms', () => {
  it('신한체크 승인 (한 줄)', () => {
    expect(parseCardSms('[신한체크승인] 한*현(1111) 11/09 20:15 (금액)1,950원 씨유(CU)관악뉴포레점')).toEqual({
      kind: 'approve',
      company: '신한',
      check: true,
      last4: '1111',
      month: 11,
      day: 9,
      time: '20:15',
      amount: 1950,
      currency: null,
      foreignAmount: null,
      installmentMonths: 1,
      merchant: '씨유(CU)관악뉴포레점',
    });
    const s = parseCardSms('[신한체크승인] 한*현(1111) 10/30 12:28 (금액)10,000원 고플랙스코인노래연습장');
    expect(s?.amount).toBe(10000);
    expect(s?.merchant).toBe('고플랙스코인노래연습장');
  });

  it('삼성 해외승인 (여러 줄, USD)', () => {
    const s = parseCardSms('[Web발신]\n삼성2222해외승인 한*현\nUSD 22.00\n11/09 20:12 ANTHROPIC*CLAUDE');
    expect(s).toMatchObject({
      kind: 'approve',
      company: '삼성',
      check: false,
      last4: '2222',
      month: 11,
      day: 9,
      time: '20:12',
      amount: null,
      currency: 'USD',
      foreignAmount: 22,
      merchant: 'ANTHROPIC*CLAUDE',
    });
    expect(parseCardSms('[Web발신]\n삼성2222해외승인 한*현\nUSD 11.00\n10/31 14:52 ANTHROPIC')?.merchant).toBe('ANTHROPIC');
  });

  it('여러 줄 국내 승인: 누적 금액은 건너뛰고 할부 개월을 읽는다', () => {
    const s = parseCardSms('[Web발신]\n현대카드 M 승인\n한*현\n120,000원 3개월\n11/09 20:15\n스타벅스\n누적1,234,567원');
    expect(s).toMatchObject({ company: '현대', amount: 120000, installmentMonths: 3, merchant: '스타벅스', time: '20:15' });
    const nh = parseCardSms('[Web발신]\nNH카드3*3*승인\n한*현\n12,000원 일시불\n11/09 08:05\n이디야커피\n총누적123,456원');
    expect(nh).toMatchObject({ company: '농협', amount: 12000, installmentMonths: 1, merchant: '이디야커피', time: '08:05' });
  });

  it('취소 문자', () => {
    expect(parseCardSms('[신한체크취소] 한*현(1111) 11/09 20:30 (금액)1,950원 씨유(CU)관악뉴포레점')?.kind).toBe('cancel');
  });

  it('카드 문자가 아니거나 거절이면 null', () => {
    expect(parseCardSms('[Web발신]\n인증번호는 123456입니다')).toBeNull();
    expect(parseCardSms('삼성 승인거절 한도초과 11/09 20:12 12,000원')).toBeNull();
    expect(parseCardSms('신한은행 입출금 안내')).toBeNull();
  });
});

describe('resolveSmsDate / toWon', () => {
  it('받은 날보다 미래 날짜면 작년', () => {
    expect(resolveSmsDate(11, 9, '2026-11-10')).toBe('2026-11-09');
    expect(resolveSmsDate(12, 31, '2027-01-01')).toBe('2026-12-31');
  });
  it('환율 환산', () => {
    expect(toWon('USD', 22, { USD: 1400 })).toBe(30800);
    expect(toWon('THB', 100, { USD: 1400 })).toBeNull();
  });
});
