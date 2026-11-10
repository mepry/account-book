/**
 * 고정지출·예산 항목 추가/수정 창: 카테고리 + 금액. 수정이면 삭제 버튼도 있다.
 * 키보드에 가리지 않게 창을 화면 위쪽에 띄운다.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { deleteBudgetItem, saveBudgetItem, type BudgetItem, type BudgetKind } from '../db/budget';
import type { Category } from '../db/queries';
import { useDb } from '../hooks/useDb';
import { bumpDataVersion } from '../lib/dataVersion';
import { log } from '../lib/logger';
import { formatNumber, parseAmount } from '../lib/money';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';
import { CategoryTreePicker } from './CategoryTreePicker';

/** 창을 여는 방법: 새 항목(종류) 또는 기존 항목 수정 */
export type BudgetEditTarget = { mode: 'add'; kind: BudgetKind } | { mode: 'edit'; item: BudgetItem };

export const KIND_LABELS: Record<BudgetKind, string> = { fixed: '고정지출', budget: '예산' };

interface Props {
  target: BudgetEditTarget | null;
  ym: string;
  /** 지출 카테고리 전체 */
  categories: Category[];
  /** 이 달에 이미 쓴 카테고리 id (고를 수 없게) */
  usedCategoryIds: number[];
  onClose: () => void;
}

/**
 * 항목 추가/수정 창. 닫혀 있으면 아무것도 그리지 않아서, 열 때마다 입력값이 새로 채워진다.
 */
export function BudgetItemModal(props: Props) {
  return props.target ? <BudgetItemDialog {...props} target={props.target} /> : null;
}

/**
 * 열린 상태의 창.
 */
function BudgetItemDialog({ target, ym, categories, usedCategoryIds, onClose }: Props & { target: BudgetEditTarget }) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const db = useDb();
  const [categoryId, setCategoryId] = useState<number | null>(target.mode === 'edit' ? target.item.category_id : null);
  const [amountText, setAmountText] = useState(target.mode === 'edit' ? formatNumber(target.item.amount) : '');
  const [pickerOpen, setPickerOpen] = useState(false);

  const kind = target.mode === 'edit' ? target.item.kind : target.kind;
  const ownId = target.mode === 'edit' ? target.item.category_id : null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const picked = categoryId !== null ? byId.get(categoryId) : undefined;
  const pickedParent = picked?.parent_id != null ? byId.get(picked.parent_id) : undefined;
  const categoryLabel = picked ? `${pickedParent ? `${pickedParent.name} > ` : ''}${picked.name}` : '카테고리 선택';
  const amount = parseAmount(amountText);
  const canSave = categoryId !== null && amount > 0;

  /** 저장하고 닫는다. */
  const save = (): void => {
    if (categoryId === null || amount <= 0) return;
    saveBudgetItem(db, { id: target.mode === 'edit' ? target.item.id : undefined, ym, kind, categoryId, amount })
      .then(() => {
        bumpDataVersion();
        onClose();
      })
      .catch((e) => log.error('예산 항목 저장 실패', e));
  };

  /** 지우고 닫는다. */
  const remove = (): void => {
    if (target.mode !== 'edit') return;
    deleteBudgetItem(db, target.item.id)
      .then(() => {
        bumpDataVersion();
        onClose();
      })
      .catch((e) => log.error('예산 항목 삭제 실패', e));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => undefined}>
          <Text style={styles.title}>
            {KIND_LABELS[kind]} {target.mode === 'edit' ? '수정' : '추가'}
          </Text>
          <Text style={styles.label}>카테고리</Text>
          <Pressable style={styles.field} onPress={() => setPickerOpen(true)}>
            <Text style={[styles.fieldText, categoryId === null && { color: theme.colors.subText }]}>{categoryLabel} ▾</Text>
          </Pressable>
          <Text style={styles.label}>한 달 금액</Text>
          <View style={styles.amountRow}>
            <TextInput
              style={[styles.field, styles.amountInput]}
              value={amountText}
              onChangeText={(v) => {
                const n = parseAmount(v);
                setAmountText(n > 0 ? formatNumber(n) : '');
              }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={theme.colors.subText}
              autoFocus={target.mode === 'edit'}
            />
            <Text style={styles.won}>원</Text>
          </View>
          <View style={styles.buttons}>
            {target.mode === 'edit' ? (
              <Pressable style={[styles.button, styles.danger]} onPress={remove}>
                <Text style={[styles.buttonText, { color: theme.colors.onDanger }]}>삭제</Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable style={styles.button} onPress={onClose}>
              <Text style={styles.buttonText}>취소</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.primary, !canSave && styles.disabled]} onPress={save} disabled={!canSave}>
              <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>저장</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      <CategoryTreePicker
        visible={pickerOpen}
        title="카테고리"
        categories={categories}
        selected={categoryId}
        onSelect={setCategoryId}
        onClose={() => setPickerOpen(false)}
        // 이 달에 이미 있는 카테고리는 고를 수 없다 (지금 고치는 항목 자신은 제외)
        disabledIds={usedCategoryIds.filter((id) => id !== ownId)}
        majorSub="소분류 지출 포함"
      />
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    // 키보드가 올라와도 가리지 않게 위쪽에 둔다
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-start', paddingTop: 90, paddingHorizontal: 24 },
    dialog: { backgroundColor: t.colors.bg, borderRadius: t.radius + 4, padding: 18, gap: 6 },
    title: { fontSize: 18, fontWeight: '700', color: t.colors.text, marginBottom: 6 },
    label: { fontSize: 13, color: t.colors.subText, marginTop: 6 },
    field: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: t.colors.surface,
    },
    fieldText: { fontSize: 16, color: t.colors.text },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    amountInput: { flex: 1, fontSize: 18, color: t.colors.text, textAlign: 'right' },
    won: { fontSize: 16, color: t.colors.text },
    buttons: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
    button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: t.radius, backgroundColor: t.colors.surface },
    buttonText: { fontSize: 15, color: t.colors.text, fontWeight: '600' },
    primary: { backgroundColor: t.colors.primary },
    danger: { backgroundColor: t.colors.danger },
    disabled: { opacity: 0.4 },
  });
