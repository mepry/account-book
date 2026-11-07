/**
 * 테마 정의 검사: 모든 테마가 같은 색 키를 갖고, 글자가 배경 위에서 잘 읽히는지(대비 4.5:1 이상).
 */
import { DEFAULT_THEME_ID, THEME_IDS, THEMES, themeById, type ThemeColors } from '../src/theme';

/**
 * #rrggbb 색의 상대 휘도 (WCAG).
 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 두 색의 명암 대비.
 */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const keys = Object.keys(THEMES.classic.colors).sort();

test.each(THEME_IDS)('%s: 색 키가 모두 있고 #rrggbb 형식', (id) => {
  const c = THEMES[id].colors;
  expect(Object.keys(c).sort()).toEqual(keys);
  for (const v of Object.values(c)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  for (const v of THEMES[id].chartPalette) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  expect(THEMES[id].chartPalette.length).toBeGreaterThanOrEqual(10);
});

/** [글자, 배경] 짝: 본문·버튼·바 글자는 4.5:1 이상 */
const textPairs: [keyof ThemeColors, keyof ThemeColors][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['subText', 'bg'],
  ['headerText', 'header'],
  ['onPrimary', 'primary'],
  ['onDanger', 'danger'],
];

test.each(THEME_IDS)('%s: 글자 대비 4.5:1 이상', (id) => {
  const c = THEMES[id].colors;
  // 실패 시 어느 짝인지 보이도록 짝 이름과 함께 비교한다
  const low = textPairs
    .map(([fg, bg]) => ({ pair: `${fg}/${bg}`, ratio: contrast(c[fg], c[bg]) }))
    .filter((p) => p.ratio < 4.5);
  expect(low).toEqual([]);
});

test.each(THEME_IDS)('%s: 원형 오늘 표시는 숫자가 보이고, 금액 색은 배경과 구분된다', (id) => {
  const t = THEMES[id];
  const c = t.colors;
  if (t.todayShape === 'circle') expect(contrast(c.onPrimary, c.today)).toBeGreaterThanOrEqual(4.5);
  for (const k of ['expense', 'income', 'sunday', 'saturday', 'today'] as const) {
    expect(contrast(c[k], c.bg)).toBeGreaterThanOrEqual(3);
  }
});

test('저장 값으로 테마 찾기: 모르는 값은 기본 테마', () => {
  expect(themeById('midnight').id).toBe('midnight');
  expect(themeById('없는테마').id).toBe(DEFAULT_THEME_ID);
  expect(themeById(null).id).toBe(DEFAULT_THEME_ID);
});
