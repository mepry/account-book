/**
 * 날짜를 탭하면 아래에서 올라오는 그날 내역 목록. 항목을 탭하면 수정 폼, 길게 누르면 삭제 확인.
 * 제목 옆 이모지 버튼으로 그 날짜에 이모지를 붙일 수 있다 (지출·수입 달력 공용).
 */
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LedgerItem, TxType } from '../db/queries';
import { formatWon } from '../lib/money';
import { type Theme } from '../theme';
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
  /** 이 날짜의 이모지 */
  mark?: string;
  /** 이모지 변경 (null = 지우기) */
  onChangeMark: (emoji: string | null) => void;
}

/** 자주 쓸 만한 이모지 */
const PRESET_EMOJIS = [
  '😀', '🥰', '😎', '🥳', '😴', '😭', '😡', '🤒',
  '🎉', '🎂', '🎁', '💝', '🎭', '🎬', '🎵', '📚',
  '✈️', '🚗', '🏠', '🏥', '💼', '💰', '💳', '🛍️',
  '☕', '🍰', '🍺', '🍜', '🍗', '⭐', '❤️', '🔥',
];

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
}: Props) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const total = items.filter((i) => !i.excluded).reduce((s, i) => s + i.amount, 0);
  const [paletteFor, setPaletteFor] = useState<string | null>(null);
  const [customEmoji, setCustomEmoji] = useState('');
  // 날짜가 바뀌면 팔레트는 자동으로 닫힌다
  const paletteOpen = paletteFor !== null && paletteFor === date;

  /** 이모지를 고르고 팔레트를 닫는다. */
  const pick = (emoji: string | null): void => {
    onChangeMark(emoji);
    setPaletteFor(null);
    setCustomEmoji('');
  };
  return (
    <Modal visible={date !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{date}</Text>
            <Pressable
              style={[styles.markButton, paletteOpen && styles.markButtonOpen]}
              hitSlop={8}
              onPress={() => setPaletteFor(paletteOpen ? null : date)}
              accessibilityLabel="날짜 이모지 고르기"
            >
              <Text style={mark ? styles.markText : styles.markPlaceholder}>{mark ?? '☺︎+'}</Text>
            </Pressable>
          </View>
          <Text style={[styles.total, { color: type === 'expense' ? theme.colors.expense : theme.colors.income }]}>
            {loading ? '' : formatWon(total)}
          </Text>
        </View>
        {paletteOpen ? (
          <View style={styles.palette}>
            <View style={styles.paletteGrid}>
              {PRESET_EMOJIS.map((e) => (
                <Pressable key={e} style={[styles.emojiCell, mark === e && styles.emojiCellOn]} onPress={() => pick(e)}>
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.paletteActions}>
              <TextInput
                style={styles.customInput}
                value={customEmoji}
                onChangeText={setCustomEmoji}
                placeholder="직접 입력 (키보드 이모지)"
                placeholderTextColor={theme.colors.subText}
                returnKeyType="done"
                onSubmitEditing={() => customEmoji.trim() && pick(customEmoji.trim())}
              />
              {customEmoji.trim() ? (
                <Pressable style={styles.paletteButton} onPress={() => pick(customEmoji.trim())}>
                  <Text style={styles.paletteButtonText}>적용</Text>
                </Pressable>
              ) : null}
              {mark ? (
                <Pressable style={styles.paletteButton} onPress={() => pick(null)}>
                  <Text style={styles.paletteButtonText}>지우기</Text>
                </Pressable>
              ) : null}
            </View>
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
                  {item.excluded ? ' · 통계 제외' : ''}
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
      height: 32,
      paddingHorizontal: 6,
      borderRadius: t.radius + 6,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    markButtonOpen: { backgroundColor: t.colors.surface },
    markText: { fontSize: 20 },
    markPlaceholder: { fontSize: 14, color: t.colors.subText },
    palette: { paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
    // 한 줄에 8개씩
    paletteGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    emojiCell: { width: '12.5%', height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    emojiCellOn: { backgroundColor: t.colors.surface },
    emoji: { fontSize: 24 },
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
