/**
 * 설정 화면 결제수단 추가·이름 바꾸기·삭제 레이어.
 * 쓴 내역이 있는 결제수단은 지우지 않고 숨긴다 (과거 내역·통계에는 이름이 그대로 남는다).
 */
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  addPaymentMethod,
  countPaymentMethodUsage,
  deletePaymentMethod,
  renamePaymentMethod,
  type PaymentMethod,
} from '../db/queries';
import { useDb } from '../hooks/useDb';
import { bumpDataVersion } from '../lib/dataVersion';
import { log } from '../lib/logger';
import { formatNumber } from '../lib/money';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

export type PaymentMethodEditTarget = { mode: 'add' } | { mode: 'edit'; method: PaymentMethod };

interface Props {
  target: PaymentMethodEditTarget | null;
  onClose: () => void;
}

/**
 * 결제수단 편집 모달.
 */
export function PaymentMethodEditModal({ target, onClose }: Props) {
  const styles = useStyles(makeStyles);
  return (
    <Modal visible={target !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => undefined}>
          {/* 열릴 때마다 새로 그려서 대상 이름으로 초기화한다 */}
          {target ? <Body target={target} onClose={onClose} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * 모달 내용: 이름 입력 + 저장/삭제.
 */
function Body({ target, onClose }: { target: PaymentMethodEditTarget; onClose: () => void }) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const db = useDb();
  const [name, setName] = useState(target.mode === 'edit' ? target.method.name : '');
  const [error, setError] = useState<string | null>(null);

  /** 저장 (추가 또는 이름 바꾸기). 이름이 비었거나 겹치면 안내만 하고 닫지 않는다. */
  const save = async (): Promise<void> => {
    try {
      if (target.mode === 'add') await addPaymentMethod(db, name);
      else await renamePaymentMethod(db, target.method.id, name);
      bumpDataVersion();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** 쓴 건수를 알려 주고 삭제(또는 숨김)한다. */
  const remove = async (): Promise<void> => {
    if (target.mode !== 'edit') return;
    const { method } = target;
    try {
      const used = await countPaymentMethodUsage(db, method.id);
      const message =
        used > 0
          ? `이 결제수단으로 입력된 내역 ${formatNumber(used)}건은 그대로 남고, 목록에서만 숨겨집니다.`
          : '이 결제수단으로 입력된 내역은 없습니다.';
      Alert.alert(`'${method.name}' 삭제`, message, [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            deletePaymentMethod(db, method.id)
              .then(() => {
                bumpDataVersion();
                onClose();
              })
              .catch((e) => {
                log.error('결제수단 삭제 실패', e);
                setError(e instanceof Error ? e.message : String(e));
              });
          },
        },
      ]);
    } catch (e) {
      log.error('결제수단 사용 건수 조회 실패', e);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Text style={styles.title}>{target.mode === 'add' ? '결제수단 추가' : '결제수단 수정'}</Text>
      <View style={styles.body}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="예) 신한카드"
          placeholderTextColor={theme.colors.subText}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void save()}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          {target.mode === 'edit' ? (
            <Pressable style={[styles.button, styles.danger]} onPress={() => void remove()}>
              <Text style={styles.dangerText}>삭제</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.button, styles.cancel]} onPress={onClose}>
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.save]} onPress={() => void save()}>
            <Text style={styles.saveText}>저장</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
    dialog: { backgroundColor: t.colors.bg, borderRadius: t.radius, overflow: 'hidden' },
    title: { backgroundColor: t.colors.header, color: t.colors.headerText, fontSize: 18, fontWeight: '700', padding: 16 },
    body: { padding: 16, gap: 8 },
    input: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontSize: 16,
      color: t.colors.text,
    },
    error: { fontSize: 13, color: t.colors.danger },
    actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    button: { flex: 1, paddingVertical: 12, borderRadius: t.radius, alignItems: 'center' },
    danger: { backgroundColor: t.colors.danger },
    dangerText: { fontSize: 15, fontWeight: '700', color: t.colors.onDanger },
    cancel: { backgroundColor: t.colors.surface },
    cancelText: { fontSize: 15, color: t.colors.text },
    save: { backgroundColor: t.colors.primary },
    saveText: { fontSize: 15, fontWeight: '700', color: t.colors.onPrimary },
  });
