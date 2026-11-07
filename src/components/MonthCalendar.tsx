/**
 * 월 달력. 칸마다 날짜, 날짜 이모지, 일 합계를 보여준다.
 * 날짜 탭 → onPressDay, 길게 누르기 → onLongPressDay.
 */
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buildWeeks } from '../lib/calendar';
import { formatNumber } from '../lib/money';
import { type Theme, WEEKDAYS } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

interface Props {
  /** YYYY-MM */
  ym: string;
  totals: Record<string, number>;
  /** 날짜별 이모지 (지출·수입 공용) */
  marks: Record<string, string>;
  today: string;
  selectedDate: string | null;
  onPressDay: (date: string) => void;
  onLongPressDay: (date: string) => void;
}

/** 요일별 글자색 */
const dayColor = (t: Theme, weekday: number): string =>
  weekday === 0 ? t.colors.sunday : weekday === 6 ? t.colors.saturday : t.colors.text;

function MonthCalendarImpl({ ym, totals, marks, today, selectedDate, onPressDay, onLongPressDay }: Props) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const weeks = useMemo(() => buildWeeks(ym), [ym]);
  const circle = theme.todayShape === 'circle';

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, styles.headerRow]}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} style={[styles.weekday, { color: dayColor(theme, i) }]}>
            {w}
          </Text>
        ))}
      </View>

      {weeks.map((week) => (
        <View key={week[0].date} style={styles.row}>
          {week.map((c) => {
            const isToday = c.date === today;
            const isSelected = c.date === selectedDate;
            const total = totals[c.date];
            const mark = marks[c.date];
            const showTotal = (c.inMonth && c.date <= today) || total !== undefined;
            const numColor = c.inMonth ? dayColor(theme, c.weekday) : theme.colors.muted;
            return (
              <Pressable
                key={c.date}
                style={[
                  styles.dayCell,
                  isToday && !circle && styles.todayCell,
                  isSelected && !(isToday && !circle) && styles.selectedCell,
                ]}
                onPress={() => onPressDay(c.date)}
                onLongPress={() => onLongPressDay(c.date)}
                delayLongPress={400}
                accessibilityLabel={`${c.date}${mark ? ` ${mark}` : ''} 합계 ${total ?? 0}원`}
              >
                <View style={[styles.dayNumWrap, isToday && circle && styles.todayCircle]}>
                  <Text
                    style={[
                      styles.dayNum,
                      { color: numColor },
                      isToday && { color: circle ? theme.colors.onPrimary : theme.colors.today },
                    ]}
                  >
                    {c.day}
                  </Text>
                </View>
                <Text style={[styles.mark, !c.inMonth && styles.markOut]} numberOfLines={1}>
                  {mark ?? ''}
                </Text>
                {showTotal ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.dayTotal,
                      !c.inMonth && { color: theme.colors.muted },
                      c.weekday === 0 && c.inMonth && { color: theme.colors.sunday },
                      isToday && { color: theme.colors.today },
                    ]}
                  >
                    {formatNumber(total ?? 0)}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export const MonthCalendar = memo(MonthCalendarImpl);

const makeStyles = (t: Theme) => {
  const line = t.calendarGrid ? StyleSheet.hairlineWidth : 0;
  const circle = t.todayShape === 'circle';
  return StyleSheet.create({
    // 격자 없는 테마는 칸 사이 여백으로 카드처럼 보이게 한다
    wrap: t.calendarGrid ? {} : { paddingHorizontal: 4, paddingBottom: 6 },
    row: { flexDirection: 'row', borderBottomWidth: line, borderColor: t.colors.border },
    headerRow: t.calendarGrid
      ? { paddingVertical: 8, borderTopWidth: 2, borderBottomWidth: 2, borderColor: t.colors.border }
      : { paddingVertical: 10 },
    weekday: { flex: 1, textAlign: 'center', fontSize: t.calendarGrid ? 14 : 12, fontWeight: t.calendarGrid ? '400' : '600' },
    dayCell: {
      flex: 1,
      height: 78,
      alignItems: 'center',
      paddingTop: circle ? 6 : 8,
      borderRightWidth: line,
      borderColor: t.colors.border,
      borderRadius: t.calendarGrid ? 0 : t.radius - 4,
      margin: t.calendarGrid ? 0 : 1,
    },
    // dayCell의 borderRightWidth가 borderWidth보다 우선하므로 오른쪽도 명시한다
    todayCell: { borderWidth: 2, borderRightWidth: 2, borderColor: t.colors.today, backgroundColor: t.colors.todayBg },
    selectedCell: { backgroundColor: t.colors.surface },
    dayNumWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    todayCircle: { backgroundColor: t.colors.today },
    dayNum: { fontSize: circle ? 15 : 16, fontWeight: '600' },
    // 이모지 칸은 비어 있어도 높이를 차지해서 합계 위치가 흔들리지 않게 한다
    mark: { fontSize: 15, lineHeight: 20, height: 20 },
    markOut: { opacity: 0.4 },
    dayTotal: { marginTop: 2, fontSize: 11, color: t.colors.text, paddingHorizontal: 2 },
  });
};
