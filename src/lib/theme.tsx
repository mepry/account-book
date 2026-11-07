/**
 * 테마 Context. 저장된 테마를 첫 화면부터 적용하고, 설정에서 바꾸면 앱 전체가 바로 바뀐다.
 * SQLiteProvider 안에 둬야 한다.
 */
import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { setSetting, THEME_SETTING_KEY } from '../db/queries';
import { wrapExpoDb } from '../db/expoAdapter';
import { themeById, type Theme, type ThemeId } from '../theme';
import { log } from './logger';

interface ThemeState {
  theme: Theme;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/**
 * 테마 제공자. 첫 렌더에서 DB를 동기로 읽어 테마가 깜박이지 않게 한다.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [themeId, setThemeId] = useState<string | null>(() => {
    try {
      return (
        db.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [THEME_SETTING_KEY])?.value ??
        null
      );
    } catch (e) {
      log.warn('저장된 테마를 읽지 못함', e);
      return null;
    }
  });

  const value = useMemo<ThemeState>(
    () => ({
      theme: themeById(themeId),
      setTheme: (id) => {
        setThemeId(id);
        setSetting(wrapExpoDb(db), THEME_SETTING_KEY, id).catch((e) => log.error('테마 저장 실패', e));
      },
    }),
    [db, themeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** 현재 테마 */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('ThemeProvider 밖에서 useTheme 사용');
  return ctx.theme;
}

/** 테마 바꾸기 (저장 포함) */
export function useSetTheme(): (id: ThemeId) => void {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('ThemeProvider 밖에서 useSetTheme 사용');
  return ctx.setTheme;
}

/**
 * 테마에 맞는 스타일을 만든다. 테마가 바뀔 때만 다시 만든다.
 * @param makeStyles (theme) => StyleSheet.create({...})
 */
export function useStyles<T>(makeStyles: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => makeStyles(theme), [makeStyles, theme]);
}
