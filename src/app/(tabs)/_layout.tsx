/**
 * 하단 탭: 지출 / 수입 / 예산 / 통계.
 */
import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { BottomTabBar } from '../../components/BottomTabBar';
import { useTheme } from '../../lib/theme';

/** 글자 하나로 된 탭 아이콘 */
const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  };

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      // 직접 만든 탭 바: 내비 버튼과 겹치지 않고, 누르면 칸 전체에 사각형 물결
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '지출', tabBarIcon: icon('−') }} />
      <Tabs.Screen name="income" options={{ title: '수입', tabBarIcon: icon('+') }} />
      <Tabs.Screen name="budget" options={{ title: '예산', tabBarIcon: icon('₩') }} />
      <Tabs.Screen name="stats" options={{ title: '통계', tabBarIcon: icon('◔') }} />
    </Tabs>
  );
}
