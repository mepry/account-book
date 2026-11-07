/**
 * 공용 선택 모달: 목록 선택(OptionPicker), 달력 날짜 선택(DatePickerModal), 시간 선택(openTimePicker).
 */
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { buildWeeks } from '../lib/calendar';
import { pad2, today as todayFn } from '../lib/date';
import { type Theme, WEEKDAYS } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

/**
 * YYYY-MM에 개월 수를 더한다.
 */
function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map((s) => parseInt(s, 10));
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

export interface Option<T> {
  label: string;
  value: T;
  sub?: string;
}

interface OptionPickerProps<T> {
  visible: boolean;
  title: string;
  options: Option<T>[];
  selected?: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}

/**
 * 목록에서 하나를 고르는 모달.
 */
export function OptionPicker<T>({ visible, title, options, selected, onSelect, onClose }: OptionPickerProps<T>) {
  const styles = useStyles(makeStyles);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => undefined}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(o, i) => `${String(o.value)}-${i}`}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.option, item.value === selected && styles.optionSelected]}
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
              >
                <Text style={styles.optionText}>{item.label}</Text>
                {item.sub ? <Text style={styles.optionSub}>{item.sub}</Text> : null}
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface DatePickerModalProps {
  visible: boolean;
  value: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}

/**
 * 달력에서 날짜를 고르는 모달.
 * 위쪽 "YYYY년 M월"을 누르면 연·월을 바로 고르는 화면으로 바뀐다.
 */
export function DatePickerModal({ visible, value, onSelect, onClose }: DatePickerModalProps) {
  const styles = useStyles(makeStyles);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => undefined}>
          {/* 열릴 때마다 새로 그려서 value 기준으로 초기화한다 */}
          {visible ? <DatePickerBody value={value} onSelect={onSelect} onClose={onClose} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * 날짜 선택 모달 내용: 달력 ↔ 연·월 선택 화면.
 */
function DatePickerBody({ value, onSelect, onClose }: Omit<DatePickerModalProps, 'visible'>) {
  const styles = useStyles(makeStyles);
  // 달력이 보여줄 달 (YYYY-MM)
  const [viewYm, setViewYm] = useState(value.slice(0, 7));
  const [pickingMonth, setPickingMonth] = useState(false);
  const [gridYear, setGridYear] = useState(parseInt(value.slice(0, 4), 10));

  const openMonthGrid = (ym: string): void => {
    setGridYear(parseInt(ym.slice(0, 4), 10));
    setPickingMonth(true);
  };

  return (
    <>
      {pickingMonth ? (
        <View style={styles.grid}>
          <View style={styles.gridHeader}>
            <Pressable hitSlop={12} onPress={() => setGridYear(gridYear - 1)} accessibilityLabel="이전 해">
              <Text style={styles.gridArrow}>‹</Text>
            </Pressable>
            <Text style={styles.gridYear}>{gridYear}년</Text>
            <Pressable hitSlop={12} onPress={() => setGridYear(gridYear + 1)} accessibilityLabel="다음 해">
              <Text style={styles.gridArrow}>›</Text>
            </Pressable>
          </View>
          <View style={styles.monthGrid}>
            {Array.from({ length: 12 }, (_, i) => {
              const ym = `${gridYear}-${pad2(i + 1)}`;
              const active = ym === viewYm;
              return (
                <Pressable
                  key={ym}
                  style={[styles.monthCell, active && styles.monthCellActive]}
                  onPress={() => {
                    setViewYm(ym);
                    setPickingMonth(false);
                  }}
                >
                  <Text style={[styles.monthText, active && styles.monthTextActive]}>{i + 1}월</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <DayGrid
          ym={viewYm}
          value={value}
          onChangeYm={setViewYm}
          onOpenMonthGrid={() => openMonthGrid(viewYm)}
          onSelect={(d) => {
            onSelect(d);
            onClose();
          }}
        />
      )}
    </>
  );
}

interface DayGridProps {
  /** 보여줄 달 YYYY-MM */
  ym: string;
  /** 선택된 날짜 YYYY-MM-DD */
  value: string;
  onChangeYm: (ym: string) => void;
  onOpenMonthGrid: () => void;
  onSelect: (date: string) => void;
}

/**
 * 날짜 선택용 달력 격자. 달마다 팝업 높이가 바뀌지 않게 항상 6주로 그린다.
 */
function DayGrid({ ym, value, onChangeYm, onOpenMonthGrid, onSelect }: DayGridProps) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const weeks = buildWeeks(ym);
  const today = todayFn();
  const [y, m] = ym.split('-');

  return (
    <View style={styles.dayGrid}>
      <View style={styles.gridHeader}>
        <Pressable hitSlop={12} onPress={() => onChangeYm(shiftYm(ym, -1))} accessibilityLabel="이전 달">
          <Text style={styles.gridArrow}>‹</Text>
        </Pressable>
        <Pressable hitSlop={8} onPress={onOpenMonthGrid} accessibilityLabel="연·월 선택">
          <Text style={styles.calHeader}>
            {y}년 {parseInt(m, 10)}월 ▾
          </Text>
        </Pressable>
        <Pressable hitSlop={12} onPress={() => onChangeYm(shiftYm(ym, 1))} accessibilityLabel="다음 달">
          <Text style={styles.gridArrow}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} style={[styles.weekdayText, i === 0 && { color: theme.colors.sunday }, i === 6 && { color: theme.colors.saturday }]}>
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0].date} style={styles.weekRow}>
          {week.map((c) => {
            const selected = c.date === value;
            const color = !c.inMonth
              ? theme.colors.muted
              : c.weekday === 0
                ? theme.colors.sunday
                : c.weekday === 6
                  ? theme.colors.saturday
                  : theme.colors.text;
            return (
              <Pressable key={c.date} style={styles.dayCell} onPress={() => onSelect(c.date)} accessibilityLabel={c.date}>
                <View style={[styles.dayCircle, selected && { backgroundColor: theme.colors.primary }]}>
                  <Text
                    style={[
                      styles.dayText,
                      { color },
                      c.date === today && !selected && { color: theme.colors.today, fontWeight: '700' },
                      selected && { color: theme.colors.onPrimary, fontWeight: '700' },
                    ]}
                  >
                    {c.day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * 안드로이드 시간 선택 다이얼로그를 연다.
 * @param value 현재 시각 HH:MM
 * @param onSelect 선택 시 HH:MM 전달
 */
export function openTimePicker(value: string, onSelect: (time: string) => void): void {
  const [h, m] = value.split(':').map((s) => parseInt(s, 10));
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  DateTimePickerAndroid.open({
    value: d,
    mode: 'time',
    is24Hour: true,
    onChange: (event, date) => {
      if (event.type === 'set' && date) onSelect(`${pad2(date.getHours())}:${pad2(date.getMinutes())}`);
    },
  });
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
    dialog: { backgroundColor: t.colors.bg, borderRadius: t.radius, maxHeight: '80%', overflow: 'hidden' },
    dialogTitle: {
      backgroundColor: t.colors.header,
      color: t.colors.headerText,
      fontSize: 18,
      fontWeight: '700',
      padding: 16,
    },
    option: { paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
    optionSelected: { backgroundColor: t.colors.surface },
    optionText: { fontSize: 16, color: t.colors.text },
    optionSub: { fontSize: 12, color: t.colors.subText, marginTop: 2 },
    calHeader: { fontSize: 17, fontWeight: '700', color: t.colors.text, paddingVertical: 6 },
    dayGrid: { paddingHorizontal: 8, paddingTop: 12, paddingBottom: 10 },
    weekRow: { flexDirection: 'row' },
    weekdayText: { flex: 1, textAlign: 'center', fontSize: 13, color: t.colors.subText, paddingVertical: 6 },
    dayCell: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
    dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    dayText: { fontSize: 15 },
    grid: { padding: 16 },
    gridHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    gridArrow: { fontSize: 30, color: t.colors.primary, paddingHorizontal: 16 },
    gridYear: { fontSize: 18, fontWeight: '700', color: t.colors.text },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    monthCell: { width: '25%', paddingVertical: 16, alignItems: 'center', borderRadius: t.radius },
    monthCellActive: { backgroundColor: t.colors.primary },
    monthText: { fontSize: 16, color: t.colors.text },
    monthTextActive: { color: t.colors.onPrimary, fontWeight: '700' },
  });
