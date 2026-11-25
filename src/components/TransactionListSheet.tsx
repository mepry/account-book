/**
 * 거래 목록 바텀시트: 제목·합계 + 거래 목록 (최신순). 거래를 누르면 수정, 길게 누르면 삭제 확인.
 * 예산 항목을 길게 눌렀을 때 그 예산의 지출 목록을 보여주는 데 쓴다.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CategoryItem } from '../db/queries';
import { formatNumber, formatWon } from '../lib/money';
import { titleWithDetail } from '../lib/stats';
import { type Theme } from '../theme';
import { useStyles } from '../lib/theme';

interface Props {
  visible: boolean;
  title: string;
  /** 제목 아래 작은 글씨 (예: 기간) */
  sub?: string;
  /** 거래 목록 (null이면 불러오는 중) */
  items: CategoryItem[] | null;
  onClose: () => void;
  /** 거래 탭 → 수정 대상 id */
  onPressItem: (editId: number) => void;
  /** 거래 길게 누르기 (삭제 확인) */
  onLongPressItem: (item: CategoryItem) => void;
}

/**
 * 거래 목록 바텀시트.
 */
export function TransactionListSheet({ visible, title, sub, items, onClose, onPressItem, onLongPressItem }: Props) {
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const total = (items ?? []).reduce((s, it) => s + it.amount, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.total}>{formatWon(total)}</Text>
        </View>
        <Text style={styles.sub}>
          {[sub, items ? `${items.length}건` : null].filter(Boolean).join(' · ')}
        </Text>
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
          {items === null ? <Text style={styles.empty}>불러오는 중…</Text> : null}
          {items !== null && items.length === 0 ? <Text style={styles.empty}>내역이 없습니다</Text> : null}
          {(items ?? []).map((it) => (
            <Pressable
              key={it.id}
              style={[styles.row, it.excluded ? styles.excluded : null]}
              onPress={() => onPressItem(it.edit_id)}
              onLongPress={() => onLongPressItem(it)}
            >
              <Text style={styles.rowDate}>{it.date.slice(5).replace('-', '/')}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={2}>
                  {titleWithDetail(it.title || '(내역 없음)', it.detail)}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {[
                    it.category,
                    it.installment_seq ? `할부 ${it.installment_seq}/${it.installment_months}` : null,
                    it.excluded ? '제외' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Text style={styles.rowAmount}>₩{formatNumber(it.amount)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: t.colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75%', paddingBottom: 16 },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.muted, marginTop: 8 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
    title: { flex: 1, fontSize: 18, fontWeight: '700', color: t.colors.text },
    total: { fontSize: 18, fontWeight: '700', color: t.colors.text },
    sub: { fontSize: 12, color: t.colors.subText, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 },
    empty: { textAlign: 'center', color: t.colors.subText, paddingVertical: 20 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    excluded: { opacity: 0.5 },
    rowDate: { width: 42, fontSize: 13, color: t.colors.subText },
    rowName: { fontSize: 15, color: t.colors.text },
    rowSub: { fontSize: 12, color: t.colors.subText, marginTop: 2 },
    rowAmount: { minWidth: 90, textAlign: 'right', fontSize: 15, color: t.colors.text },
  });
