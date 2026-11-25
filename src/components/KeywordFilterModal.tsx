/**
 * 통계 검색어 필터 입력 레이어. 태그·내역·상세·메모에서 찾을 검색어와, 들어 있으면 뺄 제외 검색어를 받는다.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

/** 검색어 + 제외 검색어 (빈 문자열 = 없음) */
export interface KeywordValue {
  keyword: string;
  exclude: string;
}

interface Props {
  visible: boolean;
  /** 지금 걸려 있는 값 */
  value: KeywordValue;
  /** 적용 (둘 다 빈 문자열 = 해제) */
  onApply: (value: KeywordValue) => void;
  onClose: () => void;
}

/**
 * 검색어 필터 모달.
 */
export function KeywordFilterModal({ visible, value, onApply, onClose }: Props) {
  const styles = useStyles(makeStyles);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => undefined}>
          {/* 열릴 때마다 새로 그려서 지금 값으로 초기화한다 */}
          {visible ? <Body value={value} onApply={onApply} onClose={onClose} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * 모달 내용: 검색어·제외 검색어 입력칸 + 지우기/적용.
 */
function Body({ value, onApply, onClose }: Omit<Props, 'visible'>) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const [keyword, setKeyword] = useState(value.keyword);
  const [exclude, setExclude] = useState(value.exclude);

  /** 값을 적용하고 닫는다. */
  const apply = (v: KeywordValue): void => {
    onApply({ keyword: v.keyword.trim(), exclude: v.exclude.trim() });
    onClose();
  };

  return (
    <>
      <Text style={styles.title}>검색 필터</Text>
      <View style={styles.body}>
        <Text style={styles.label}>검색어</Text>
        <TextInput
          style={styles.input}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="예: 뮤지컬, 올리브영"
          placeholderTextColor={theme.colors.subText}
          autoFocus
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => apply({ keyword, exclude })}
        />
        <Text style={styles.hint}>태그·내역·상세·메모에서 찾아요</Text>
        <Text style={[styles.label, styles.excludeLabel]}>제외 검색어</Text>
        <TextInput
          style={styles.input}
          value={exclude}
          onChangeText={setExclude}
          placeholder="예: 회식 교통"
          placeholderTextColor={theme.colors.subText}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={() => apply({ keyword, exclude })}
        />
        <Text style={styles.hint}>띄어쓰기로 여러 개. 하나라도 들어 있으면 통계에서 빼요</Text>
        <View style={styles.actions}>
          <Pressable style={[styles.button, styles.clear]} onPress={() => apply({ keyword: '', exclude: '' })}>
            <Text style={styles.clearText}>지우기</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.applyButton]} onPress={() => apply({ keyword, exclude })}>
            <Text style={styles.applyText}>적용</Text>
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
    label: { fontSize: 13, fontWeight: '700', color: t.colors.text },
    excludeLabel: { marginTop: 8, color: t.colors.expense },
    input: {
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontSize: 16,
      color: t.colors.text,
    },
    hint: { fontSize: 12, color: t.colors.subText },
    actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    button: { flex: 1, paddingVertical: 12, borderRadius: t.radius, alignItems: 'center' },
    clear: { backgroundColor: t.colors.surface },
    clearText: { fontSize: 15, color: t.colors.text },
    applyButton: { backgroundColor: t.colors.primary },
    applyText: { fontSize: 15, fontWeight: '700', color: t.colors.onPrimary },
  });
