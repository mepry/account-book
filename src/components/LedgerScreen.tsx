/**
 * 지출/수입 탭 공용 화면: 월 이동, 이번 달 합계, 제외 포함 토글, 달력, 그날 내역 시트, 입력 폼.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getDailyTotals,
  getDayColors,
  getDayItems,
  getDayMarks,
  getMonthInstallments,
  setDayColor,
  setDayMark,
  setTransactionExcluded,
  type InstallmentItem,
  type LedgerItem,
  type TxType,
} from '../db/queries';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useDb } from '../hooks/useDb';
import { calendarRange } from '../lib/calendar';
import { bumpDataVersion, useDataVersion } from '../lib/dataVersion';
import { elapsedDays, nowTime, today as todayFn } from '../lib/date';
import { log } from '../lib/logger';
import { formatNumber } from '../lib/money';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';
import { DaySheet } from './DaySheet';
import { InstallmentSection } from './InstallmentSection';
import { MonthCalendar } from './MonthCalendar';
import { DatePickerModal } from './Pickers';
import { TodayButton, TopBar } from './TopBar';
import { TransactionForm, type FormTarget } from './TransactionForm';

/**
 * YYYY-MM에 개월 수를 더한다.
 */
function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map((s) => parseInt(s, 10));
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const sum = (r: Record<string, number>): number => Object.values(r).reduce((s, v) => s + v, 0);

/** 손가락을 왼쪽으로 밀 때 이동할 달 수 (+1 = 다음 달). 오른쪽으로 밀면 반대. */
const SWIPE_LEFT_DELTA = +1;
/** 달 이동으로 인정하는 가로 이동 거리(px) */
const SWIPE_MIN_DX = 50;
/** 상단 아이콘 크기 */
const ICON_SIZE = 28;
/** 달 바뀜 애니메이션 시간(ms) */
const MONTH_ANIM_MS = 180;

/** 화면에 그리는 한 달치 데이터. 다 불러온 뒤 한 번에 바꿔서 이전 달 잔상이 섞이지 않게 한다. */
interface MonthView {
  ym: string;
  /** 달력 칸 일별 합계 (제외 항목도 포함해서 항상 보여준다) */
  totals: Record<string, number>;
  /** 상단 이번 달 합계 (할부 제외 일반 건, 제외 항목은 토글에 따라) */
  monthSum: number;
  otherTotal: number;
  marks: Record<string, string>;
  /** 날짜별 칸 배경색 키 */
  colors: Record<string, string>;
  /** 이번 달 할부 분할 건 (달력 칸 대신 달력 아래에 따로 보여준다) */
  installments: InstallmentItem[];
}

/**
 * 지출/수입 달력 화면.
 * @param type 지출 또는 수입
 */
export function LedgerScreen({ type }: { type: TxType }) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const db = useDb();
  const version = useDataVersion();
  const today = todayFn();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [view, setView] = useState<MonthView>({ ym, totals: {}, monthSum: 0, otherTotal: 0, marks: {}, colors: {}, installments: [] });
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  // 내역은 어느 날짜의 것인지 같이 들고 있어야, 다른 날짜를 눌렀을 때 이전 날짜 내역이 잠깐 보이지 않는다
  const [sheetData, setSheetData] = useState<{ date: string; items: LedgerItem[] } | null>(null);
  const [form, setForm] = useState<FormTarget | null>(null);
  const [showAverage, setShowAverage] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [installmentsOpen, setInstallmentsOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const other: TxType = type === 'expense' ? 'income' : 'expense';
    const range = calendarRange(ym);
    Promise.all([
      // 할부 분할 건은 말일 칸에 몰리지 않게 달력에서 빼고 아래 할부금 영역에 따로 보여준다.
      // 달력 칸에는 제외 항목도 보여주고, 상단 합계에서만 뺀다.
      getDailyTotals(db, type, ym, true, { skipInstallmentParts: true }),
      getDailyTotals(db, type, ym, includeExcluded, { skipInstallmentParts: true }),
      getDailyTotals(db, other, ym, includeExcluded),
      getDayMarks(db, range.from, range.to),
      getDayColors(db, range.from, range.to),
      getMonthInstallments(db, type, ym, true),
    ])
      .then(([cells, mine, theirs, marks, colors, installments]) => {
        if (!alive) return;
        setView({ ym, totals: cells, monthSum: sum(mine), otherTotal: sum(theirs), marks, colors, installments });
      })
      .catch((e) => log.error('월 합계 조회 실패', e));
    return () => {
      alive = false;
    };
  }, [db, type, ym, includeExcluded, version]);

  useEffect(() => {
    if (!sheetDate) return;
    let alive = true;
    getDayItems(db, type, sheetDate, { skipInstallmentParts: true })
      .then((items) => alive && setSheetData({ date: sheetDate, items }))
      .catch((e) => log.error('일별 내역 조회 실패', e));
    return () => {
      alive = false;
    };
  }, [db, type, sheetDate, version]);

  // 달력 가로 스와이프로 달 이동 (세로 스크롤·날짜 탭은 그대로)
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, g) => {
          if (Math.abs(g.dx) < SWIPE_MIN_DX) return;
          const delta = g.dx < 0 ? SWIPE_LEFT_DELTA : -SWIPE_LEFT_DELTA;
          setYm((cur) => shiftYm(cur, delta));
        },
      }),
    // setYm은 바뀌지 않지만 React Compiler 검사를 위해 명시한다
    [setYm],
  );

  // 달이 바뀌면 달력이 이동 방향으로 살짝 밀려 들어오며 나타난다
  // (그려지기 전에 시작값을 넣어야 새 달이 한 프레임 번쩍이지 않으므로 useLayoutEffect)
  const [opacity] = useState(() => new Animated.Value(1));
  const [shift] = useState(() => new Animated.Value(0));
  const shownYm = useRef(view.ym);
  useLayoutEffect(() => {
    if (shownYm.current === view.ym) return;
    const dir = view.ym > shownYm.current ? 1 : -1;
    shownYm.current = view.ym;
    opacity.setValue(0.4);
    shift.setValue(dir * 28);
    const config = { toValue: 0, duration: MONTH_ANIM_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true };
    Animated.parallel([Animated.timing(opacity, { ...config, toValue: 1 }), Animated.timing(shift, config)]).start();
  }, [view.ym, opacity, shift]);
  const calendarStyle = { opacity, transform: [{ translateX: shift }] };

  // React Compiler가 메모이즈하므로 useCallback 없이 둔다
  const onPressDay = (date: string): void => setSheetDate(date);
  const onLongPressDay = (date: string): void => setForm({ mode: 'new', date, time: nowTime() });

  /** 달력 팝업에서 고른 날짜의 달로 이동하고 그날 내역을 연다. */
  const jumpTo = (date: string): void => {
    setYm(date.slice(0, 7));
    setSheetDate(date);
  };

  const confirmDelete = useConfirmDelete();

  /** 내역 시트에서 통계 제외를 바로 바꾼다. */
  const toggleExcluded = (item: LedgerItem): void => {
    setTransactionExcluded(db, item.edit_id, !item.excluded)
      .then(bumpDataVersion)
      .catch((e) => log.error('제외 설정 실패', e));
  };

  /** 날짜 이모지를 바꾼다. 지출·수입 탭 모두 다시 조회해서 같이 바뀐다. */
  const changeMark = (emoji: string | null): void => {
    if (!sheetDate) return;
    setDayMark(db, sheetDate, emoji)
      .then(bumpDataVersion)
      .catch((e) => log.error('날짜 이모지 저장 실패', e));
  };

  /** 날짜 칸 배경색을 바꾼다. 지출·수입 탭 모두 같이 바뀐다. */
  const changeColor = (color: string | null): void => {
    if (!sheetDate) return;
    setDayColor(db, sheetDate, color)
      .then(bumpDataVersion)
      .catch((e) => log.error('날짜 색 저장 실패', e));
  };

  const { totals, monthSum, otherTotal, marks, colors, installments } = view;
  // 이번 달 합계에는 할부금도 포함한다 (달력 칸에서만 뺐음). 제외 항목은 토글을 켰을 때만 더한다.
  const installmentTotal = installments.reduce((s, i) => s + (i.excluded && !includeExcluded ? 0 : i.amount), 0);
  const monthTotal = monthSum + installmentTotal;
  const days = elapsedDays(view.ym, today);
  const [y, m] = ym.split('-');
  const net = type === 'income' ? monthTotal - otherTotal : otherTotal - monthTotal;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="가계부" titleAccessory={<TodayButton onPress={() => setYm(today.slice(0, 7))} />}>
        <Pressable style={styles.iconButton} hitSlop={8} onPress={() => router.push('/settings')} accessibilityLabel="설정">
          <Ionicons name="settings-outline" size={ICON_SIZE - 2} color={theme.colors.headerText} />
        </Pressable>
        <Pressable
          style={styles.iconButton}
          hitSlop={8}
          onPress={() => setForm({ mode: 'new', date: today, time: nowTime() })}
          accessibilityLabel="추가"
        >
          <Ionicons name="add" size={ICON_SIZE + 4} color={theme.colors.headerText} />
        </Pressable>
        <Pressable
          style={styles.iconButton}
          hitSlop={8}
          onPress={() => router.push({ pathname: '/search', params: { type } })}
          accessibilityLabel="검색"
        >
          <Ionicons name="search-outline" size={ICON_SIZE - 2} color={theme.colors.headerText} />
        </Pressable>
      </TopBar>

      <ScrollView style={{ backgroundColor: theme.colors.bg }}>
        <View style={styles.controls}>
          <Pressable style={[styles.pill, styles.arrow]} onPress={() => setYm(shiftYm(ym, -1))}>
            <Text style={styles.pillText}>←</Text>
          </Pressable>
          <Pressable style={[styles.pill, { flex: 3 }]} onPress={() => setJumpOpen(true)} accessibilityLabel="날짜 이동">
            <Text style={styles.pillText}>
              {y}년 {parseInt(m, 10)}월
            </Text>
          </Pressable>
          <Pressable style={[styles.pill, styles.arrow]} onPress={() => setYm(shiftYm(ym, 1))}>
            <Text style={styles.pillText}>→</Text>
          </Pressable>
          <Pressable
            style={[styles.pill, { flex: 3 }]}
            onPress={() => setShowAverage(!showAverage)}
            accessibilityLabel={showAverage ? '일평균 (탭하면 합계)' : '합계 (탭하면 일평균)'}
          >
            <Text style={[styles.pillText, { fontWeight: '700' }]} numberOfLines={1} adjustsFontSizeToFit>
              {showAverage ? (
                <>
                  <Text style={styles.pillCaption}>일평균 </Text>
                  {days > 0 ? `₩${formatNumber(Math.round(monthTotal / days))}` : '—'}
                </>
              ) : (
                `₩${formatNumber(monthTotal)}`
              )}
            </Text>
          </Pressable>
        </View>

        <View style={styles.subRow}>
          <Pressable
            style={styles.toggle}
            onPress={() => setIncludeExcluded(!includeExcluded)}
            accessibilityRole="switch"
            accessibilityState={{ checked: includeExcluded }}
          >
            <Text style={styles.toggleText}>{includeExcluded ? '☑' : '☐'} 제외 항목 포함</Text>
          </Pressable>
          <Text style={styles.net}>
            이번 달 수입-지출 :{' '}
            <Text style={{ color: net < 0 ? theme.colors.expense : theme.colors.income }}>
              {net < 0 ? '-' : ''}₩{formatNumber(Math.abs(net))}
            </Text>
          </Text>
        </View>

        <Animated.View {...swipe.panHandlers} style={calendarStyle}>
          <MonthCalendar
            ym={view.ym}
            totals={totals}
            marks={marks}
            colors={colors}
            today={today}
            selectedDate={sheetDate}
            onPressDay={onPressDay}
            onLongPressDay={onLongPressDay}
          />
        </Animated.View>

        <InstallmentSection
          items={installments}
          open={installmentsOpen}
          onToggle={() => setInstallmentsOpen(!installmentsOpen)}
          onPressItem={(id) => setForm({ mode: 'edit', id })}
        />
      </ScrollView>

      <DaySheet
        date={form ? null : sheetDate}
        type={type}
        items={sheetData && sheetData.date === sheetDate ? sheetData.items : []}
        loading={!sheetData || sheetData.date !== sheetDate}
        onClose={() => setSheetDate(null)}
        onPressItem={(item) => setForm({ mode: 'edit', id: item.edit_id })}
        onAdd={(date) => setForm({ mode: 'new', date, time: nowTime() })}
        onToggleExcluded={toggleExcluded}
        onLongPressItem={(item) => confirmDelete(item.edit_id, item.kind === 'installment_part')}
        mark={sheetDate ? marks[sheetDate] : undefined}
        onChangeMark={changeMark}
        color={sheetDate ? colors[sheetDate] : undefined}
        onChangeColor={changeColor}
      />
      <DatePickerModal
        visible={jumpOpen}
        value={sheetDate ?? (ym === today.slice(0, 7) ? today : `${ym}-01`)}
        onSelect={jumpTo}
        onClose={() => setJumpOpen(false)}
      />
      <TransactionForm type={type} target={form} onClose={() => setForm(null)} />
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.colors.header },
    // 세 아이콘이 같은 크기의 칸 가운데에 오도록 한다
    iconButton: { width: ICON_SIZE + 6, height: ICON_SIZE + 6, alignItems: 'center', justifyContent: 'center' },
    // 상단바 바로 아래가 답답해 보이지 않게 위쪽 여백을 넉넉히 둔다
    controls: { flexDirection: 'row', gap: 6, padding: 6, paddingTop: 14, backgroundColor: t.colors.bg },
    pill: {
      flex: 1,
      backgroundColor: t.colors.surface,
      borderRadius: t.radius,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrow: { flex: 1 },
    pillText: { fontSize: 17, color: t.colors.text },
    pillCaption: { fontSize: 13, fontWeight: '400', color: t.colors.subText },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingBottom: 8,
      backgroundColor: t.colors.bg,
    },
    toggle: { paddingVertical: 4 },
    toggleText: { fontSize: 14, color: t.colors.text },
    net: { fontSize: 14, color: t.colors.text },
  });
