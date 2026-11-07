/**
 * 달력 아래 "할부금" 영역. 이번 달에 걸린 할부 분할 건을 모아 보여준다.
 * 헤더를 탭하면 바로 아래로 펼쳐져 회차·남은 금액을 보여주고, 항목을 탭하면 수정 폼을 연다.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { InstallmentItem } from '../db/queries';
import { formatNumber } from '../lib/money';
import { type Theme } from '../theme';
import { useStyles } from '../lib/theme';

interface Props {
  items: InstallmentItem[];
  /** 펼침 여부 */
  open: boolean;
  onToggle: () => void;
  /** 항목 탭 → 수정 대상(총액 행) id */
  onPressItem: (editId: number) => void;
}

/**
 * 이번 달 할부금 목록. 할부가 없으면 아무것도 그리지 않는다.
 */
export function InstallmentSection({ items, open, onToggle, onPressItem }: Props) {
  const styles = useStyles(makeStyles);
  if (items.length === 0) return null;
  const total = items.filter((i) => !i.excluded).reduce((s, i) => s + i.amount, 0);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.header}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`이번 달 할부금 ${items.length}건 ${total}원`}
      >
        <Text style={styles.headerTitle}>
          할부금 <Text style={styles.headerCount}>{items.length}건</Text>
        </Text>
        <Text style={styles.headerTotal}>
          ₩{formatNumber(total)} {open ? '▴' : '▾'}
        </Text>
      </Pressable>

      {open
        ? items.map((item) => {
            const left = item.installment_months - item.installment_seq;
            return (
              <Pressable
                key={item.id}
                style={[styles.item, item.excluded ? styles.itemExcluded : null]}
                onPress={() => onPressItem(item.edit_id)}
              >
                <View style={styles.itemMain}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.title || '(내역 없음)'}
                    {item.payment ? <Text style={styles.itemSub}> · {item.payment}</Text> : null}
                  </Text>
                  <Text style={styles.itemAmount}>₩{formatNumber(item.amount)}</Text>
                </View>
                <Text style={styles.itemDetail}>
                  {item.installment_seq}/{item.installment_months}회차 ·{' '}
                  {left > 0 ? `남은 ${left}회 ₩${formatNumber(item.remaining_amount)}` : '이번 달 완납'} · 총 ₩
                  {formatNumber(item.total)}
                  {item.excluded ? ' · 제외' : ''}
                </Text>
              </Pressable>
            );
          })
        : null}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { marginHorizontal: 6, marginTop: 8, marginBottom: 12, backgroundColor: t.colors.surface, borderRadius: t.radius, overflow: 'hidden' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14 },
    headerTitle: { fontSize: 15, fontWeight: '700', color: t.colors.text },
    headerCount: { fontSize: 13, fontWeight: '400', color: t.colors.subText },
    headerTotal: { fontSize: 15, fontWeight: '700', color: t.colors.expense },
    item: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.bg,
    },
    itemExcluded: { opacity: 0.5 },
    itemMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    itemTitle: { flex: 1, fontSize: 15, color: t.colors.text },
    itemSub: { fontSize: 13, color: t.colors.subText },
    itemAmount: { fontSize: 15, fontWeight: '600', color: t.colors.text },
    itemDetail: { marginTop: 3, fontSize: 12, color: t.colors.subText },
  });
