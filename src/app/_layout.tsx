/**
 * 루트 레이아웃: 앱 DB(SQLiteProvider) 초기화 + 테마 + 스택(탭, 설정, 검색).
 */
import { Stack } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { wrapExpoDb } from '../db/expoAdapter';
import { initSchema } from '../db/schema';
import { ThemeProvider, useTheme } from '../lib/theme';

/**
 * DB가 처음 열릴 때 스키마를 만든다.
 */
async function onInit(db: SQLiteDatabase): Promise<void> {
  await initSchema(wrapExpoDb(db));
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="accountbook.db" onInit={onInit}>
      <ThemeProvider>
        <ThemedStack />
      </ThemeProvider>
    </SQLiteProvider>
  );
}

/** 테마 색을 쓰는 스택 (설정·검색 화면 헤더 포함) */
function ThemedStack() {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <>
      <StatusBar style={theme.statusBar} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.header },
          headerTintColor: colors.headerText,
          headerShadowVisible: theme.colors.header !== theme.colors.bg,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: '설정' }} />
        <Stack.Screen name="search" options={{ title: '검색' }} />
      </Stack>
    </>
  );
}
