/**
 * 하단 탭 바 (지출 / 수입 / 예산 / 통계).
 * - 안드로이드 홈·내비 버튼 영역(safe area) 위로 올려서 겹치지 않게 한다.
 * - 누를 때 물결이 원이 아니라 탭 칸 전체를 채우는 사각형으로 퍼진다.
 */
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

/** 아이콘 크기 */
const ICON_SIZE = 18;
/** safe area 아래에 더 띄우는 여백(px) */
const EXTRA_BOTTOM = 4;

/**
 * expo-router Tabs의 tabBar로 넘기는 탭 바.
 */
export function BottomTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const safe = useSafeAreaInsets();
  // 네비게이터가 넘겨준 값과 기기 값 중 큰 쪽을 써서 내비 버튼과 겹치지 않게 한다
  const bottom = Math.max(insets.bottom, safe.bottom) + EXTRA_BOTTOM;

  return (
    <View style={[styles.bar, { paddingBottom: bottom }]} role="tablist">
      {state.routes.map((route, index) => {
        const focused = index === state.index;
        const { options } = descriptors[route.key];
        const color = focused ? theme.colors.primary : theme.colors.muted;
        const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);

        /** 탭 이동 (기본 탭 바와 같은 이벤트 순서) */
        const onPress = (): void => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };

        return (
          <Pressable
            key={route.key}
            style={styles.tab}
            onPress={onPress}
            onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
            // borderless: false → 물결이 원이 아니라 이 칸 크기의 사각형으로 퍼진다
            android_ripple={{ color: theme.colors.border, borderless: false, foreground: true }}
            role="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
          >
            {options.tabBarIcon?.({ focused, color, size: ICON_SIZE })}
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: t.colors.bg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    // 칸 전체가 눌리는 영역 = 물결 영역
    tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, overflow: 'hidden' },
    label: { fontSize: 13, marginTop: 2 },
  });
