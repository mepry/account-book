/**
 * 설정: 테마, 백업·복원, 카테고리 추가·수정·삭제와 "기본 제외" 설정.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  countTransactions,
  getCategories,
  getSetting,
  setCategoryDefaultExcluded,
  THEME_SETTING_KEY,
  type Category,
  type TxType,
} from '../db/queries';
import { useDb } from '../hooks/useDb';
import { CategoryEditModal, type CategoryEditTarget } from '../components/CategoryEditModal';
import { getLastBackupAt, pickAndRestoreBackup, saveBackup } from '../lib/backupFile';
import { bumpDataVersion, useDataVersion } from '../lib/dataVersion';
import { log } from '../lib/logger';
import { formatNumber } from '../lib/money';
import { themeById, THEME_IDS, THEMES, type Theme } from '../theme';
import { useSetTheme, useStyles, useTheme } from '../lib/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  // 맨 아래 내용이 안드로이드 홈·내비 버튼에 가리지 않게 그만큼 더 띄운다
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const setTheme = useSetTheme();
  const db = useDb();
  const version = useDataVersion();
  const [type, setType] = useState<TxType>('expense');
  const [categories, setCategories] = useState<Category[]>([]);
  const [catEdit, setCatEdit] = useState<CategoryEditTarget | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupResult, setBackupResult] = useState<string | null>(null);

  useEffect(() => {
    getLastBackupAt(db)
      .then(setLastBackup)
      .catch((e) => log.error('마지막 백업 시각 조회 실패', e));
  }, [db, version]);

  /** 백업 파일을 만들어 고른 폴더에 저장한다. */
  const runBackup = async (): Promise<void> => {
    setBackupBusy(true);
    setBackupResult(null);
    try {
      const saved = await saveBackup(db);
      if (!saved) return;
      setLastBackup(saved.at);
      setBackupResult(`저장했습니다: ${saved.name}`);
    } catch (e) {
      log.error('백업 실패', e);
      Alert.alert('백업 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setBackupBusy(false);
    }
  };

  /** 백업 파일을 골라 복원한다. */
  const runRestore = async (): Promise<void> => {
    setBackupBusy(true);
    setBackupResult(null);
    try {
      const summary = await pickAndRestoreBackup(db);
      if (!summary) return;
      // 테마도 백업 시점 것으로 돌아간다
      setTheme(themeById(await getSetting(db, THEME_SETTING_KEY)).id);
      bumpDataVersion();
      setBackupResult(
        [
          `복원했습니다: 내역 ${formatNumber(summary.transactions)}건, 카테고리 ${formatNumber(summary.categories)}개`,
          ...(summary.missingTables.length ? [`(예전 백업이라 비어 있는 항목: ${summary.missingTables.join(', ')})`] : []),
        ].join('\n'),
      );
    } catch (e) {
      log.error('복원 실패', e);
      Alert.alert('복원 실패', `${e instanceof Error ? e.message : String(e)}\n\n지금 데이터는 바뀌지 않았습니다.`);
    } finally {
      setBackupBusy(false);
    }
  };

  /** 복원 전에 지금 데이터가 모두 바뀐다는 것을 확인받는다. */
  const confirmRestore = async (): Promise<void> => {
    const n = await countTransactions(db);
    if (n === 0) {
      await runRestore();
      return;
    }
    Alert.alert(
      '백업에서 복원',
      `지금 있는 내역 ${formatNumber(n)}건과 설정이 모두 백업 파일 내용으로 바뀝니다.\n(지금 데이터는 앱 안에 '복원전_자동백업'으로 한 번 남겨 둡니다)`,
      [
        { text: '취소', style: 'cancel' },
        { text: '복원', style: 'destructive', onPress: () => void runRestore() },
      ],
    );
  };

  useEffect(() => {
    getCategories(db, type)
      .then(setCategories)
      .catch((e) => log.error('카테고리 조회 실패', e));
  }, [db, type, version]);

  const byId = new Map(categories.map((c) => [c.id, c]));
  const sorted = [...categories].sort((a, b) => {
    const ka = a.parent_id === null ? [a.sort, a.id, -1] : [byId.get(a.parent_id)?.sort ?? 0, a.parent_id, a.sort];
    const kb = b.parent_id === null ? [b.sort, b.id, -1] : [byId.get(b.parent_id)?.sort ?? 0, b.parent_id, b.sort];
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 32 + insets.bottom }}>
      <Text style={styles.section}>테마</Text>
      <View style={styles.themeGrid}>
        {THEME_IDS.map((id) => (
          <ThemeCard key={id} preview={THEMES[id]} active={theme.id === id} onPress={() => setTheme(id)} />
        ))}
      </View>

      <Text style={styles.section}>백업·복원</Text>
      <Text style={[styles.help, !lastBackup && { color: theme.colors.danger }]}>
        {lastBackup ? `마지막 백업: ${lastBackup}` : '아직 백업한 적이 없습니다. 폰을 바꾸거나 앱을 지우면 데이터가 사라져요.'}
      </Text>
      <Text style={styles.help}>저장할 폴더(다운로드, 구글 드라이브 등)를 고르면 백업 파일(.db)을 만듭니다.</Text>
      <View style={styles.buttonGroup}>
        <Pressable style={styles.button} onPress={() => void runBackup()} disabled={backupBusy}>
          {backupBusy ? <ActivityIndicator color={theme.colors.onPrimary} /> : <Text style={styles.buttonText}>백업 파일 저장</Text>}
        </Pressable>
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={() => void confirmRestore()} disabled={backupBusy}>
          <Text style={[styles.buttonText, styles.buttonSecondaryText]}>백업에서 복원</Text>
        </Pressable>
      </View>
      {backupResult ? <Text style={styles.result}>{backupResult}</Text> : null}

      <Text style={styles.section}>카테고리</Text>
      <Text style={styles.help}>
        이름을 누르면 이름 바꾸기·삭제, 오른쪽 스위치는 &lsquo;기본 제외&rsquo;(켜 두면 새로 입력할 때 &lsquo;통계 제외&rsquo;가 자동 체크)입니다.
      </Text>
      <View style={styles.segments}>
        {(['expense', 'income'] as const).map((t) => (
          <Pressable key={t} style={[styles.segment, type === t && styles.segmentActive]} onPress={() => setType(t)}>
            <Text style={[styles.segmentText, type === t && { color: theme.colors.onPrimary }]}>
              {t === 'expense' ? '지출' : '수입'}
            </Text>
          </Pressable>
        ))}
      </View>
      {sorted.map((c) => (
        <View key={c.id} style={styles.row}>
          <Pressable
            style={styles.nameButton}
            onPress={() =>
              setCatEdit({
                mode: 'edit',
                category: c,
                parent: c.parent_id !== null ? (byId.get(c.parent_id) ?? null) : null,
                childCount: categories.filter((x) => x.parent_id === c.id).length,
              })
            }
            accessibilityLabel={`${c.name} 수정`}
          >
            <Text style={[styles.name, c.parent_id !== null && styles.child]}>
              {c.parent_id !== null ? '└ ' : ''}
              {c.name}
            </Text>
          </Pressable>
          {c.parent_id === null ? (
            <Pressable
              style={styles.addSub}
              hitSlop={6}
              onPress={() => setCatEdit({ mode: 'add', type, parent: c })}
              accessibilityLabel={`${c.name}에 소분류 추가`}
            >
              <Text style={styles.addSubText}>+ 소분류</Text>
            </Pressable>
          ) : null}
          <Switch
            value={c.default_excluded === 1}
            onValueChange={async (v) => {
              await setCategoryDefaultExcluded(db, c.id, v);
              bumpDataVersion();
            }}
          />
        </View>
      ))}
      <Pressable style={[styles.button, styles.buttonSecondary, { marginTop: 12 }]} onPress={() => setCatEdit({ mode: 'add', type, parent: null })}>
        <Text style={[styles.buttonText, styles.buttonSecondaryText]}>+ {type === 'expense' ? '지출' : '수입'} 대분류 추가</Text>
      </Pressable>
      <CategoryEditModal target={catEdit} onClose={() => setCatEdit(null)} />
    </ScrollView>
  );
}

/**
 * 테마 미리보기 카드: 그 테마의 바·배경·달력 오늘 표시·버튼 색을 작게 보여준다.
 * @param preview 미리 볼 테마
 * @param active 지금 쓰는 테마인지
 */
function ThemeCard({ preview, active, onPress }: { preview: Theme; active: boolean; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  const c = preview.colors;
  const circle = preview.todayShape === 'circle';
  return (
    <Pressable
      style={[styles.card, active && styles.cardActive]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${preview.name} 테마`}
    >
      <View style={[styles.preview, { backgroundColor: c.bg, borderRadius: preview.radius / 2 }]}>
        <View style={[styles.previewBar, { backgroundColor: c.header, borderBottomColor: c.border }]}>
          <View style={[styles.previewTitle, { backgroundColor: c.headerText }]} />
        </View>
        <View style={styles.previewDays}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.previewDay,
                preview.calendarGrid && { borderRightWidth: 1, borderColor: c.border },
                i === 2 &&
                  (circle
                    ? null
                    : { borderWidth: 1.5, borderRightWidth: 1.5, borderColor: c.today, backgroundColor: c.todayBg }),
              ]}
            >
              <View
                style={[
                  styles.previewDot,
                  { backgroundColor: i === 0 ? c.sunday : c.text },
                  i === 2 && circle && { backgroundColor: c.today, width: 12, height: 12, borderRadius: 6 },
                  i === 2 && !circle && { backgroundColor: c.today },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={[styles.previewButton, { backgroundColor: c.primary, borderRadius: preview.radius / 3 }]} />
      </View>
      <View style={styles.cardLabel}>
        <Text style={styles.cardName}>
          {active ? '✓ ' : ''}
          {preview.name}
        </Text>
        <Text style={styles.cardDesc} numberOfLines={1}>
          {preview.description}
        </Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    themeGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
    card: {
      width: '48%',
      flexGrow: 1,
      borderWidth: 1.5,
      borderColor: t.colors.border,
      borderRadius: t.radius,
      padding: 8,
      backgroundColor: t.colors.surface,
    },
    cardActive: { borderColor: t.colors.primary, borderWidth: 2.5 },
    preview: { height: 78, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
    previewBar: { height: 18, justifyContent: 'center', paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth },
    previewTitle: { width: 28, height: 5, borderRadius: 2.5, opacity: 0.9 },
    previewDays: { flexDirection: 'row', height: 34 },
    previewDay: { flex: 1, alignItems: 'center', paddingTop: 6 },
    previewDot: { width: 6, height: 6, borderRadius: 3 },
    previewButton: { position: 'absolute', right: 6, bottom: 6, width: 30, height: 12 },
    cardLabel: { paddingTop: 6 },
    cardName: { fontSize: 15, fontWeight: '700', color: t.colors.text },
    cardDesc: { fontSize: 12, color: t.colors.subText, marginTop: 2 },
    page: { flex: 1, backgroundColor: t.colors.bg },
    section: { fontSize: 17, fontWeight: '700', color: t.colors.text, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
    help: { fontSize: 13, color: t.colors.subText, paddingHorizontal: 16, paddingBottom: 8 },
    button: { marginHorizontal: 16, backgroundColor: t.colors.primary, borderRadius: t.radius, paddingVertical: 14, alignItems: 'center' },
    buttonText: { color: t.colors.onPrimary, fontSize: 16, fontWeight: '600' },
    buttonGroup: { gap: 8 },
    buttonSecondary: { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
    buttonSecondaryText: { color: t.colors.text },
    result: { margin: 16, padding: 12, backgroundColor: t.colors.surface, borderRadius: t.radius, fontSize: 14, color: t.colors.text },
    segments: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
    segment: { flex: 1, paddingVertical: 8, borderRadius: t.radius, backgroundColor: t.colors.surface, alignItems: 'center' },
    segmentActive: { backgroundColor: t.colors.primary },
    segmentText: { fontSize: 15, color: t.colors.text },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    name: { flex: 1, fontSize: 15, color: t.colors.text, fontWeight: '600' },
    child: { fontWeight: '400', paddingLeft: 12 },
    // 이름 칸 전체를 눌러 수정할 수 있게
    nameButton: { flex: 1, paddingVertical: 4 },
    addSub: { paddingHorizontal: 8, paddingVertical: 4, marginRight: 8, borderRadius: t.radius, borderWidth: 1, borderColor: t.colors.border },
    addSubText: { fontSize: 12, color: t.colors.subText },
  });
