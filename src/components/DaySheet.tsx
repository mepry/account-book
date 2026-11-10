/**
 * 날짜를 탭하면 아래에서 올라오는 그날 내역 목록. 항목을 탭하면 수정 폼, 길게 누르면 삭제 확인.
 * 제목 옆 이모지 버튼으로 그 날짜에 이모지(최대 3개)를, 색 버튼으로 달력 칸 배경색을 정한다 (지출·수입 달력 공용).
 */
import { useEffect, useState } from 'react';
import { FlatList, Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LedgerItem, TxType } from '../db/queries';
import { addMarks, joinMarks, MAX_MARKS, parseMarks, toggleMark } from '../lib/dayMarks';
import { formatWon } from '../lib/money';
import { DAY_COLOR_KEYS, DAY_COLORS, dayColorValue, type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

interface Props {
  date: string | null;
  type: TxType;
  items: LedgerItem[];
  /** 이 날짜 내역을 아직 불러오는 중 (이전 날짜 내역을 보여주지 않기 위함) */
  loading?: boolean;
  onClose: () => void;
  onPressItem: (item: LedgerItem) => void;
  onAdd: (date: string) => void;
  /** 항목 오른쪽 체크로 통계 제외를 바꾼다 */
  onToggleExcluded: (item: LedgerItem) => void;
  /** 항목 길게 누르기 (삭제 확인) */
  onLongPressItem: (item: LedgerItem) => void;
  /** 이 날짜의 이모지 (공백으로 이어 붙인 값) */
  mark?: string;
  /** 이모지 변경 (null = 지우기) */
  onChangeMark: (emoji: string | null) => void;
  /** 이 날짜 칸 배경색 키 */
  color?: string;
  /** 배경색 변경 (null = 지우기) */
  onChangeColor: (color: string | null) => void;
}

/** 자주 쓰는 이모지: 티켓, 팝콘, 밥, 술, 병원, 뮤지컬, 선물, 커피, 쇼핑백 */
const PRESET_EMOJIS = ['🎫', '🍿', '🍚', '🍺', '🏥', '🎭', '🎁', '☕', '🛍️'];

/** 펼친 팔레트 (날짜와 함께 들고 있어서 날짜가 바뀌면 자동으로 닫힌다) */
type Palette = { date: string; kind: 'emoji' | 'color' } | null;

/**
 * 키보드 높이 (안 보이면 0). Modal 안에서는 KeyboardAvoidingView가 불안정해서 직접 받는다.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * 그날 내역 바텀시트.
 */
export function DaySheet({
  date,
  type,
  items,
  loading,
  onClose,
  onPressItem,
  onAdd,
  onToggleExcluded,
  onLongPressItem,
  mark,
  onChangeMark,
  color,
  onChangeColor,
}: Props) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  // 하단 내비게이션 바(홈 버튼)만큼 시트 아래 여백을 더 둔다
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const window = useWindowDimensions();
  const total = items.filter((i) => !i.excluded).reduce((s, i) => s + i.amount, 0);
  const [palette, setPalette] = useState<Palette>(null);
  const [customEmoji, setCustomEmoji] = useState('');
  const openKind = palette !== null && palette.date === date ? palette.kind : null;
  const marks = parseMarks(mark);
  const full = marks.length >= MAX_MARKS;
  // 프리셋에 없는 선택 이모지 (직접 입력한 것) — 팔레트에서 해제할 수 있게 따로 보여준다
  const customMarks = marks.filter((e) => !PRESET_EMOJIS.includes(e));
  const colorValue = dayColorValue(color);

  /** 팔레트를 열고 닫는다 (이모지·색 중 하나만 열린다). */
  const togglePalette = (kind: 'emoji' | 'color'): void => {
    if (!date) return;
    setPalette(openKind === kind ? null : { date, kind });
    setCustomEmoji('');
  };

  /** 이모지 목록을 저장한다. */
  const saveMarks = (list: string[]): void => onChangeMark(joinMarks(list));

  /** 직접 입력한 이모지를 더한다. */
  const addCustom = (): void => {
    const input = customEmoji.trim();
    if (!input) return;
    saveMarks(addMarks(marks, input));
    setCustomEmoji('');
  };

  /** 색을 고르고 팔레트를 닫는다. */
  const pickColor = (key: string | null): void => {
    onChangeColor(key);
    setPalette(null);
  };

  return (
    <Modal visible={date !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            // 키보드가 올라오면 시트를 키보드 위로 밀어 올려 입력창이 가리지 않게 한다
            paddingBottom: 16 + Math.max(keyboard, insets.bottom),
            maxHeight: keyboard > 0 ? window.height - keyboard * 0.9 : '70%',
          },
        ]}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{date}</Text>
            <Pressable
              style={[styles.markButton, openKind === 'emoji' && styles.markButtonOpen]}
              hitSlop={8}
              onPress={() => togglePalette('emoji')}
              accessibilityLabel={`날짜 이모지 고르기${marks.length ? ` (${marks.join(' ')})` : ''}`}
            >
              {/* 이모지마다 Text를 따로 두고 줄 높이를 정해 둬야 안드로이드에서 여러 개 붙은 이모지가 잘리지 않는다 */}
              {marks.length ? (
                marks.map((e) => (
                  <Text key={e} style={styles.markText} numberOfLines={1}>
                    {e}
                  </Text>
                ))
              ) : (
                <Text style={styles.markPlaceholder}>☺︎+</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.markButton, openKind === 'color' && styles.markButtonOpen]}
              hitSlop={8}
              onPress={() => togglePalette('color')}
              accessibilityLabel="날짜 색 고르기"
            >
              <View style={[styles.colorDot, colorValue ? { backgroundColor: colorValue } : styles.colorDotEmpty]} />
            </Pressable>
          </View>
          <Text style={[styles.total, { color: type === 'expense' ? theme.colors.expense : theme.colors.income }]}>
            {loading ? '' : formatWon(total)}
          </Text>
        </View>
        {openKind === 'emoji' ? (
          <View style={styles.palette}>
            <View style={styles.paletteGrid}>
              {PRESET_EMOJIS.map((e) => {
                const on = marks.includes(e);
                return (
                  <Pressable
                    key={e}
                    style={[styles.emojiCell, on && styles.emojiCellOn, !on && full && styles.emojiCellDim]}
                    onPress={() => saveMarks(toggleMark(marks, e))}
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={styles.emoji}>{e}</Text>
                  </Pressable>
                );
              })}
            </View>
            {customMarks.length ? (
              <View style={styles.selectedRow}>
                <Text style={styles.hint}>직접 입력:</Text>
                {customMarks.map((e) => (
                  <Pressable key={e} style={[styles.emojiChip, styles.emojiCellOn]} onPress={() => saveMarks(toggleMark(marks, e))}>
                    <Text style={styles.chipEmoji}>{e}</Text>
                    <Text style={styles.chipX}>✕</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.paletteActions}>
              <TextInput
                style={styles.customInput}
                value={customEmoji}
                onChangeText={setCustomEmoji}
                placeholder={full ? `최대 ${MAX_MARKS}개까지 붙일 수 있어요` : '직접 입력 (키보드 이모지)'}
                placeholderTextColor={theme.colors.subText}
                editable={!full}
                returnKeyType="done"
                onSubmitEditing={addCustom}
              />
              {customEmoji.trim() ? (
                <Pressable style={styles.paletteButton} onPress={addCustom}>
                  <Text style={styles.paletteButtonText}>추가</Text>
                </Pressable>
              ) : null}
              {marks.length ? (
                <Pressable style={styles.paletteButton} onPress={() => saveMarks([])}>
                  <Text style={styles.paletteButtonText}>모두 지우기</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
        {openKind === 'color' ? (
          <View style={[styles.palette, styles.colorRow]}>
            {DAY_COLOR_KEYS.map((key) => (
              <Pressable
                key={key}
                style={[styles.colorCell, color === key && styles.colorCellOn]}
                onPress={() => pickColor(key)}
                accessibilityLabel={`색 ${key}`}
                accessibilityState={{ selected: color === key }}
              >
                <View style={[styles.colorSwatch, { backgroundColor: DAY_COLORS[key] }]} />
              </Pressable>
            ))}
            {color ? (
              <Pressable style={styles.paletteButton} onPress={() => pickColor(null)}>
                <Text style={styles.paletteButtonText}>지우기</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.id)}
          ListEmptyComponent={loading ? <View style={styles.emptyBox} /> : <Text style={styles.empty}>내역이 없습니다</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.item} onPress={() => onPressItem(item)} onLongPress={() => onLongPressItem(item)}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, item.excluded ? styles.excluded : null]} numberOfLines={1}>
                  {item.title}
                  {item.detail ? <Text style={styles.detail}> · {item.detail}</Text> : null}
                  {item.kind === 'installment_part' ? (
                    <Text style={styles.badge}>
                      {'  '}할부 {item.installment_seq}/{item.installment_months}
                    </Text>
                  ) : null}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[item.time, item.category, item.payment].filter(Boolean).join(' · ')}
                </Text>
                {item.tags ? (
                  <Text style={styles.tags} numberOfLines={1}>
                    {item.tags
                      .split(' ')
                      .map((t) => `#${t}`)
                      .join(' ')}
                  </Text>
                ) : null}
                {item.memo ? (
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.memo}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.amount, item.excluded ? styles.excluded : null]}>{formatWon(item.amount)}</Text>
              <Pressable
                style={styles.check}
                hitSlop={10}
                onPress={() => onToggleExcluded(item)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!item.excluded }}
                accessibilityLabel="통계 제외"
              >
                <Text style={[styles.checkBox, item.excluded ? styles.checkOn : null]}>{item.excluded ? '☑' : '☐'}</Text>
                <Text style={styles.checkLabel}>제외</Text>
              </Pressable>
            </Pressable>
          )}
        />
        {date ? (
          <Pressable style={styles.addButton} onPress={() => onAdd(date)}>
            <Text style={styles.addText}>+ 이 날짜에 추가</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: {
      backgroundColor: t.colors.bg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      maxHeight: '70%',
      paddingBottom: 16,
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.muted, marginTop: 8 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    markButton: {
      minWidth: 40,
      minHeight: 34,
      paddingHorizontal: 6,
      borderRadius: t.radius + 6,
      borderWidth: 1,
      borderColor: t.colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    markButtonOpen: { backgroundColor: t.colors.surface },
    markText: { fontSize: 20, lineHeight: 26, includeFontPadding: false, color: t.colors.text },
    markPlaceholder: { fontSize: 14, lineHeight: 20, color: t.colors.subText },
    colorDot: { width: 20, height: 20, borderRadius: 10 },
    colorDotEmpty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.colors.subText },
    palette: { paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
    // 프리셋 9개를 한 줄에
    paletteGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    emojiCell: { width: '11.1%', height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    emojiCellOn: { backgroundColor: t.colors.surface, borderWidth: 1.5, borderColor: t.colors.primary },
    emojiCellDim: { opacity: 0.35 },
    emoji: { fontSize: 24, lineHeight: 30, includeFontPadding: false },
    selectedRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    hint: { fontSize: 13, color: t.colors.subText },
    emojiChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    chipEmoji: { fontSize: 20, lineHeight: 26, includeFontPadding: false },
    chipX: { fontSize: 11, color: t.colors.subText },
    colorRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
    colorCell: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    colorCellOn: { borderWidth: 2, borderColor: t.colors.text },
    colorSwatch: { width: 26, height: 26, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
    paletteActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    customInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 15,
      color: t.colors.text,
    },
    paletteButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: t.radius, backgroundColor: t.colors.surface },
    paletteButtonText: { fontSize: 14, color: t.colors.text },
    title: { fontSize: 18, fontWeight: '700', color: t.colors.text },
    total: { fontSize: 18, fontWeight: '700' },
    empty: { textAlign: 'center', color: t.colors.subText, padding: 24 },
    emptyBox: { height: 66 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    itemTitle: { fontSize: 16, color: t.colors.text },
    detail: { color: t.colors.subText },
    badge: { fontSize: 12, color: t.colors.saturday },
    meta: { fontSize: 12, color: t.colors.subText, marginTop: 2 },
    tags: { fontSize: 12, color: t.colors.saturday, marginTop: 2 },
    amount: { fontSize: 16, fontWeight: '600', color: t.colors.text, marginLeft: 12 },
    excluded: { color: t.colors.muted, textDecorationLine: 'line-through' },
    check: { alignItems: 'center', marginLeft: 12, minWidth: 32 },
    checkBox: { fontSize: 22, color: t.colors.muted },
    checkOn: { color: t.colors.text },
    checkLabel: { fontSize: 10, color: t.colors.subText },
    addButton: { margin: 16, marginBottom: 0, padding: 12, borderRadius: t.radius, backgroundColor: t.colors.surface },
    addText: { textAlign: 'center', fontSize: 15, color: t.colors.text },
  });
