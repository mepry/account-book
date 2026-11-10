/**
 * 앱 테마 정의 (색·모서리·달력 모양). 화면에서는 src/lib/theme.tsx의 useTheme()/useStyles()로 쓴다.
 * React Native를 import하지 않아 테스트에서 그대로 검사할 수 있다.
 */

export type ThemeId = 'classic' | 'midnight' | 'lavender' | 'sage';

export interface ThemeColors {
  /** 상단 바 배경 */
  header: string;
  /** 상단 바 글자·아이콘 */
  headerText: string;
  /** 화면 배경 */
  bg: string;
  /** 버튼·카드·선택 배경 */
  surface: string;
  border: string;
  text: string;
  subText: string;
  /** 흐린 글자 (다른 달 날짜, 비활성) */
  muted: string;
  sunday: string;
  saturday: string;
  /** 오늘 표시 색 */
  today: string;
  /** 오늘 칸 배경 (사각형 모양일 때) */
  todayBg: string;
  expense: string;
  income: string;
  /** 주요 버튼·강조 */
  primary: string;
  /** primary 위 글자 */
  onPrimary: string;
  danger: string;
  /** danger 위 글자 */
  onDanger: string;
  /** 태그 칩 배경 */
  tagBg: string;
}

export interface Theme {
  id: ThemeId;
  /** 설정 화면에 보이는 이름 */
  name: string;
  /** 한 줄 설명 */
  description: string;
  colors: ThemeColors;
  /** 차트 색 (카테고리 순서대로) */
  chartPalette: string[];
  /** 버튼·카드 모서리 둥글기 */
  radius: number;
  /** 달력 칸 사이 선 표시 */
  calendarGrid: boolean;
  /** 오늘 표시: 칸 전체 사각형 테두리 / 날짜 숫자 뒤 원 */
  todayShape: 'box' | 'circle';
  /** 상태바 글자색 */
  statusBar: 'light' | 'dark';
}

const classic: Theme = {
  id: 'classic',
  name: '기본',
  description: '짙은 회색 바, 격자 달력',
  colors: {
    header: '#454a52',
    headerText: '#ffffff',
    bg: '#ffffff',
    surface: '#f1f1f1',
    border: '#e2e2e2',
    text: '#222222',
    subText: '#6f6f6f',
    muted: '#bdbdbd',
    sunday: '#d32f2f',
    saturday: '#1b7fa3',
    today: '#43a047',
    todayBg: '#f1f8f1',
    expense: '#d32f2f',
    income: '#1e6fd9',
    primary: '#454a52',
    onPrimary: '#ffffff',
    danger: '#c62828',
    onDanger: '#ffffff',
    tagBg: '#e7f3f8',
  },
  chartPalette: [
    '#b5e000', '#ffd000', '#ff9a2e', '#d6002f', '#a855f7', '#1e9bff',
    '#14b8a6', '#f472b6', '#8d6e63', '#94a3b8', '#65a30d', '#0ea5e9',
  ],
  radius: 10,
  calendarGrid: true,
  todayShape: 'box',
  statusBar: 'light',
};

const midnight: Theme = {
  id: 'midnight',
  name: '미드나잇',
  description: '눈이 편한 다크 모드',
  colors: {
    header: '#151922',
    headerText: '#e8eaf0',
    bg: '#12151c',
    surface: '#1f2430',
    border: '#2c3240',
    text: '#e8eaf0',
    subText: '#9aa3b2',
    muted: '#566073',
    sunday: '#ff7b7b',
    saturday: '#6ab7ff',
    today: '#5eead4',
    todayBg: '#173532',
    expense: '#ff7b7b',
    income: '#6ab7ff',
    primary: '#7c9cff',
    onPrimary: '#10131a',
    danger: '#ff6b6b',
    onDanger: '#10131a',
    tagBg: '#1e2a3a',
  },
  chartPalette: [
    '#7c9cff', '#5eead4', '#fbbf24', '#f472b6', '#a78bfa', '#34d399',
    '#fb923c', '#60a5fa', '#f87171', '#c084fc', '#2dd4bf', '#94a3b8',
  ],
  radius: 14,
  calendarGrid: false,
  todayShape: 'circle',
  statusBar: 'light',
};

const lavender: Theme = {
  id: 'lavender',
  name: '라벤더',
  description: '밝은 파스텔, 둥근 카드',
  colors: {
    header: '#f6f5fb',
    headerText: '#2b2840',
    bg: '#f6f5fb',
    surface: '#ffffff',
    border: '#e6e3f2',
    text: '#2b2840',
    subText: '#6e6987',
    muted: '#bdb8d1',
    sunday: '#d14866',
    saturday: '#3f72d6',
    today: '#6b5ae0',
    todayBg: '#ece9ff',
    expense: '#d14866',
    income: '#3f72d6',
    primary: '#6b5ae0',
    onPrimary: '#ffffff',
    danger: '#c93a58',
    onDanger: '#ffffff',
    tagBg: '#ecebff',
  },
  chartPalette: [
    '#8b7cf6', '#f9a8d4', '#7dd3fc', '#fcd34d', '#86efac', '#fda4af',
    '#c4b5fd', '#67e8f9', '#fdba74', '#a5b4fc', '#6ee7b7', '#d8b4fe',
  ],
  radius: 16,
  calendarGrid: false,
  todayShape: 'circle',
  statusBar: 'dark',
};

const sage: Theme = {
  id: 'sage',
  name: '세이지',
  description: '따뜻한 종이색과 딥그린',
  colors: {
    header: '#3f5a4a',
    headerText: '#faf7f0',
    bg: '#faf7f0',
    surface: '#f0ebdf',
    border: '#e3dccb',
    text: '#2f2a22',
    subText: '#71685a',
    muted: '#c4bba8',
    sunday: '#b4492f',
    saturday: '#2f6688',
    today: '#3f7a5a',
    todayBg: '#e7efe5',
    expense: '#b4492f',
    income: '#2f6688',
    primary: '#3f5a4a',
    onPrimary: '#faf7f0',
    danger: '#a83a2a',
    onDanger: '#ffffff',
    tagBg: '#e4ece9',
  },
  chartPalette: [
    '#3f5a4a', '#c08552', '#8fa98b', '#b4492f', '#d9b56a', '#2f6688',
    '#a3826c', '#6b8f71', '#e0a17a', '#7a8b99', '#b9a27a', '#5c7a6a',
  ],
  radius: 6,
  calendarGrid: true,
  todayShape: 'box',
  statusBar: 'light',
};

export const THEMES: Record<ThemeId, Theme> = { classic, midnight, lavender, sage };
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
export const DEFAULT_THEME_ID: ThemeId = 'classic';

/**
 * 저장된 값으로 테마를 찾는다. 모르는 값이면 기본 테마.
 * @param id 저장된 테마 id
 */
export function themeById(id: string | null | undefined): Theme {
  return id && id in THEMES ? THEMES[id as ThemeId] : THEMES[DEFAULT_THEME_ID];
}

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 날짜 칸 배경색 (DB에는 키만 저장). 반투명이라 밝은·어두운 테마 모두에서 글자가 읽힌다. */
export const DAY_COLORS = {
  red: 'rgba(239, 83, 80, 0.30)',
  orange: 'rgba(255, 152, 0, 0.30)',
  yellow: 'rgba(255, 214, 0, 0.35)',
  green: 'rgba(102, 187, 106, 0.30)',
  mint: 'rgba(38, 198, 218, 0.28)',
  blue: 'rgba(66, 133, 244, 0.28)',
  purple: 'rgba(171, 71, 188, 0.28)',
  pink: 'rgba(240, 98, 146, 0.28)',
} as const;

export type DayColorKey = keyof typeof DAY_COLORS;
export const DAY_COLOR_KEYS = Object.keys(DAY_COLORS) as DayColorKey[];

/**
 * 저장된 색 키를 실제 색으로 바꾼다. 모르는 키면 undefined.
 * @param key 저장된 색 키
 */
export function dayColorValue(key: string | null | undefined): string | undefined {
  return key && key in DAY_COLORS ? DAY_COLORS[key as DayColorKey] : undefined;
}
