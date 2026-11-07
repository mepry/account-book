/**
 * 금액 입력용 자체 숫자 키패드. 00 / 000 / 0000 키로 큰 금액을 한 번에 입력한다.
 * 칸마다 칸 전체를 채우는 사각형 물결이 퍼진다.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { applyKey, type KeypadKey } from '../lib/keypad';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

interface Props {
  /** 지금 숫자 (콤마 없음) */
  digits: string;
  onChange: (digits: string) => void;
  /** 완료 키 */
  onDone: () => void;
}

/** 키 배치 (4×4). 'done'은 완료 */
const LAYOUT: (KeypadKey | 'done')[][] = [
  ['7', '8', '9', 'back'],
  ['4', '5', '6', 'clear'],
  ['1', '2', '3', '0000'],
  ['0', '00', '000', 'done'],
];

const LABELS: Partial<Record<KeypadKey | 'done', string>> = { back: '⌫', clear: 'C', done: '완료' };
const A11Y: Partial<Record<KeypadKey | 'done', string>> = { back: '지우기', clear: '모두 지우기', done: '입력 완료' };

/**
 * 숫자 키패드.
 */
export function AmountKeypad({ digits, onChange, onDone }: Props) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.pad}>
      {LAYOUT.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((k) => {
            const isDone = k === 'done';
            const isFn = k === 'back' || k === 'clear';
            return (
              <Pressable
                key={k}
                style={[styles.key, isFn && styles.fnKey, isDone && styles.doneKey]}
                android_ripple={{ color: theme.colors.border, borderless: false, foreground: true }}
                onPress={() => (isDone ? onDone() : onChange(applyKey(digits, k)))}
                // 지우기 키는 길게 누르면 모두 지운다
                onLongPress={k === 'back' ? () => onChange('') : undefined}
                accessibilityLabel={A11Y[k] ?? k}
              >
                <Text style={[styles.keyText, k.length >= 3 && styles.zerosText, isDone && styles.doneText]}>{LABELS[k] ?? k}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    pad: { gap: 6, marginTop: 4, marginBottom: 6 },
    row: { flexDirection: 'row', gap: 6 },
    key: {
      flex: 1,
      height: 48,
      borderRadius: t.radius,
      backgroundColor: t.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    fnKey: { backgroundColor: t.colors.border },
    doneKey: { backgroundColor: t.colors.primary },
    keyText: { fontSize: 20, fontWeight: '600', color: t.colors.text },
    zerosText: { fontSize: 16 },
    doneText: { fontSize: 16, color: t.colors.onPrimary, fontWeight: '700' },
  });
