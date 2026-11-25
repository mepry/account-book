/**
 * 탭 화면 공용 상단바. 높이를 고정해 탭을 옮겨도 화면이 흔들리지 않게 한다.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useStyles } from '../lib/theme';

export const TOP_BAR_HEIGHT = 56;

/**
 * 탭 화면 바깥 틀: 상태바 높이만큼 위를 띄운다 (배경은 상단바 색).
 * SafeAreaView(네이티브)는 탭을 처음 열 때 첫 프레임에 여백 없이 그렸다가 다음 프레임에 여백을 붙여
 * 화면이 살짝 올라갔다 내려가 보이므로, 첫 렌더부터 값이 있는 useSafeAreaInsets로 직접 띄운다.
 * @param children 화면 내용
 */
export function TabScreen({ children }: { children: ReactNode }) {
  const styles = useStyles(makeStyles);
  const { top } = useSafeAreaInsets();
  return <View style={[styles.screen, { paddingTop: top }]}>{children}</View>;
}

/**
 * 제목 + 제목 옆 버튼(선택) + 오른쪽 액션 버튼(선택) 상단바.
 * @param title 제목
 * @param titleAccessory 제목 바로 옆에 놓을 것 (자리가 고정됨)
 * @param children 오른쪽에 놓을 버튼들
 */
export function TopBar({
  title,
  titleAccessory,
  children,
}: {
  title: string;
  titleAccessory?: ReactNode;
  children?: ReactNode;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {titleAccessory}
      </View>
      {children}
    </View>
  );
}

/**
 * 상단바의 "TODAY" 버튼 (오늘이 있는 달로 이동).
 * @param onPress 누르면 실행
 */
export function TodayButton({ onPress }: { onPress: () => void }) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable style={styles.today} hitSlop={6} onPress={onPress} accessibilityLabel="이번 달로 이동">
      <Text style={styles.todayText}>TODAY</Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.header },
    today: { borderWidth: 1, borderColor: t.colors.headerText, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3 },
    todayText: { color: t.colors.headerText, fontSize: 12, fontWeight: '700' },
    bar: {
      height: TOP_BAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.header,
      paddingHorizontal: 18,
      gap: 14,
    },
    // 제목 쪽이 남는 폭을 차지해 오른쪽 버튼을 끝으로 민다
    left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { flexShrink: 1, color: t.colors.headerText, fontSize: 22, fontWeight: '700' },
  });
