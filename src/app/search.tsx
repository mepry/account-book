/**
 * 검색 화면: 검색어(내역·메모·태그) + 기간 + 카테고리로 지출(또는 수입)을 찾는다.
 * 기간 기본값은 전체 기간, 카테고리 기본값은 전체. 항목을 누르면 수정 폼, 길게 누르면 삭제 확인.
 */
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryTreePicker } from '../components/CategoryTreePicker';
import { DatePickerModal, OptionPicker, type Option } from '../components/Pickers';
import { TransactionForm, type FormTarget } from '../components/TransactionForm';
import { getCategories, searchTransactions, type Category, type SearchItem, type TxType } from '../db/queries';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useDb } from '../hooks/useDb';
import { useDataVersion } from '../lib/dataVersion';
import { lastDayOfMonth, parseYmd, today as todayFn, ymd } from '../lib/date';
import { log } from '../lib/logger';
import { formatWon } from '../lib/money';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

/** 입력이 멈춘 뒤 검색까지 기다리는 시간(ms) */
const DEBOUNCE_MS = 250;

/** 기간 고르기 */
type Period = 'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

const PERIOD_OPTIONS: Option<Period>[] = [
  { label: '전체 기간', value: 'all' },
  { label: '이번 달', value: 'thisMonth' },
  { label: '지난 달', value: 'lastMonth' },
  { label: '올해', value: 'thisYear' },
  { label: '직접 지정', value: 'custom', sub: '시작일·종료일을 직접 고르기' },
];

/**
 * 한 달의 첫날·말일.
 * @param year 연
 * @param month 월 (1~12)
 */
function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: ymd(year, month, 1), to: ymd(year, month, lastDayOfMonth(year, month)) };
}

/**
 * 기간 선택값을 시작일·종료일로 바꾼다. 전체 기간이면 둘 다 null.
 * @param period 기간 종류
 * @param today 오늘 YYYY-MM-DD
 * @param custom 직접 지정한 기간
 */
function periodRange(
  period: Period,
  today: string,
  custom: { from: string; to: string },
): { from: string | null; to: string | null } {
  const { year, month } = parseYmd(today);
  switch (period) {
    case 'thisMonth':
      return monthRange(year, month);
    case 'lastMonth':
      return month === 1 ? monthRange(year - 1, 12) : monthRange(year, month - 1);
    case 'thisYear':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'custom':
      // 거꾸로 고른 경우도 앞뒤를 맞춘다
      return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
    default:
      return { from: null, to: null };
  }
}

/**
 * 검색 화면.
 */
export default function SearchScreen() {
  const theme = useTheme();
  // 목록 끝이 안드로이드 홈·내비 버튼에 가리지 않게 한다
  const insets = useSafeAreaInsets();
  const styles = useStyles(makeStyles);
  const db = useDb();
  const version = useDataVersion();
  const confirmDelete = useConfirmDelete();
  const params = useLocalSearchParams<{ type?: string }>();
  const type: TxType = params.type === 'income' ? 'income' : 'expense';
  const label = type === 'expense' ? '지출' : '수입';
  const today = todayFn();

  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>('all');
  const [custom, setCustom] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const [dateEdit, setDateEdit] = useState<'from' | 'to' | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [picker, setPicker] = useState<'period' | 'category' | null>(null);
  const [result, setResult] = useState<{ active: boolean; items: SearchItem[] }>({ active: false, items: [] });
  const [form, setForm] = useState<FormTarget | null>(null);

  const range = periodRange(period, today, custom);
  const periodLabel =
    period === 'custom'
      ? `${range.from} ~ ${range.to}`
      : (PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? '전체 기간');
  const pickedCat = categories.find((c) => c.id === categoryId);
  const pickedParent = pickedCat?.parent_id != null ? categories.find((c) => c.id === pickedCat.parent_id) : undefined;
  const categoryLabel = pickedCat ? `${pickedParent ? `${pickedParent.name} > ` : ''}${pickedCat.name}` : '전체';

  // 카테고리 목록
  useEffect(() => {
    let alive = true;
    getCategories(db, type)
      .then((cs) => alive && setCategories(cs))
      .catch((e) => log.error('카테고리 목록 조회 실패', e));
    return () => {
      alive = false;
    };
  }, [db, type, version]);

  const { from, to } = range;
  useEffect(() => {
    const q = query.trim();
    const active = !!q.replace(/^#/, '') || from !== null || categoryId !== null;
    let alive = true;
    const timer = setTimeout(() => {
      searchTransactions(db, type, { query: q, from, to, categoryId })
        .then((items) => alive && setResult({ active, items }))
        .catch((e) => log.error('검색 실패', e));
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [db, type, query, from, to, categoryId, version]);

  /** 기간을 고른다. 직접 지정이면 시작일부터 고르게 한다. */
  const pickPeriod = (p: Period): void => {
    setPeriod(p);
    if (p === 'custom') setDateEdit('from');
  };

  const items = result.items;
  const total = items.filter((i) => !i.excluded).reduce((s, i) => s + i.amount, 0);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: `${label} 검색` }} />
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="내역, 메모, #태그"
        placeholderTextColor={theme.colors.subText}
        autoFocus
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      <View style={styles.filters}>
        <Pressable
          style={[styles.chip, period !== 'all' && styles.chipOn]}
          onPress={() => setPicker('period')}
          accessibilityLabel={`기간 ${periodLabel}`}
        >
          <Text style={styles.chipCaption}>기간</Text>
          <Text style={styles.chipText} numberOfLines={1}>
            {periodLabel} ▾
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, categoryId !== null && styles.chipOn]}
          onPress={() => setPicker('category')}
          accessibilityLabel={`카테고리 ${categoryLabel}`}
        >
          <Text style={styles.chipCaption}>카테고리</Text>
          <Text style={styles.chipText} numberOfLines={1}>
            {categoryLabel} ▾
          </Text>
        </Pressable>
      </View>
      {period === 'custom' ? (
        <View style={styles.customRow}>
          <Pressable style={styles.dateButton} onPress={() => setDateEdit('from')}>
            <Text style={styles.chipText}>{custom.from}</Text>
          </Pressable>
          <Text style={styles.chipCaption}>~</Text>
          <Pressable style={styles.dateButton} onPress={() => setDateEdit('to')}>
            <Text style={styles.chipText}>{custom.to}</Text>
          </Pressable>
        </View>
      ) : null}
      {result.active ? (
        <Text style={styles.summary}>
          {items.length >= 300 ? '300건 이상' : `${items.length}건`} · 합계 {formatWon(total)}
          {items.some((i) => i.excluded) ? ' (제외 항목 빼고)' : ''}
        </Text>
      ) : null}
      <FlatList
        data={items}
        contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}
        keyExtractor={(i) => String(i.id)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={result.active ? <Text style={styles.empty}>검색 결과가 없습니다</Text> : undefined}
        renderItem={({ item }) => (
          <Pressable
            style={styles.item}
            onPress={() => setForm({ mode: 'edit', id: item.id })}
            onLongPress={() => confirmDelete(item.id, item.installment_months >= 2)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.date}>
                {item.date} {item.time}
                {item.installment_months >= 2 ? `  ·  ${item.installment_months}개월 할부` : ''}
              </Text>
              <Text style={[styles.title, item.excluded ? styles.excluded : null]} numberOfLines={1}>
                {item.title || '(내역 없음)'}
                {item.detail ? <Text style={styles.sub}> · {item.detail}</Text> : null}
              </Text>
              {item.category ? <Text style={styles.sub}>{item.category}</Text> : null}
              {item.tags ? (
                <Text style={styles.tags} numberOfLines={1}>
                  {item.tags
                    .split(' ')
                    .map((t) => `#${t}`)
                    .join(' ')}
                </Text>
              ) : null}
              {item.memo ? (
                <Text style={styles.sub} numberOfLines={1}>
                  {item.memo}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.amount, item.excluded ? styles.excluded : null]}>{formatWon(item.amount)}</Text>
          </Pressable>
        )}
      />
      <OptionPicker
        visible={picker === 'period'}
        title="기간"
        options={PERIOD_OPTIONS}
        selected={period}
        onSelect={pickPeriod}
        onClose={() => setPicker(null)}
      />
      <CategoryTreePicker
        visible={picker === 'category'}
        title="카테고리"
        categories={categories}
        selected={categoryId}
        onSelect={setCategoryId}
        onClose={() => setPicker(null)}
        allLabel="전체"
        majorSub="소분류 포함"
      />
      <DatePickerModal
        visible={dateEdit !== null}
        value={dateEdit === 'to' ? custom.to : custom.from}
        onSelect={(d) => setCustom((c) => (dateEdit === 'to' ? { ...c, to: d } : { ...c, from: d }))}
        onClose={() => setDateEdit(null)}
      />
      <TransactionForm type={type} target={form} onClose={() => setForm(null)} />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    input: {
      margin: 10,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: t.colors.text,
      backgroundColor: t.colors.surface,
    },
    filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 8 },
    chip: {
      flex: 1,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: t.colors.bg,
    },
    chipOn: { borderColor: t.colors.primary, backgroundColor: t.colors.surface },
    chipCaption: { fontSize: 11, color: t.colors.subText },
    chipText: { fontSize: 14, color: t.colors.text },
    customRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingBottom: 8 },
    dateButton: {
      flex: 1,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius,
      paddingVertical: 8,
    },
    summary: { paddingHorizontal: 14, paddingBottom: 6, fontSize: 13, color: t.colors.subText },
    empty: { textAlign: 'center', color: t.colors.subText, padding: 24 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    date: { fontSize: 12, color: t.colors.subText },
    title: { fontSize: 16, color: t.colors.text, marginTop: 2 },
    sub: { fontSize: 12, color: t.colors.subText, marginTop: 2 },
    tags: { fontSize: 12, color: t.colors.saturday, marginTop: 2 },
    amount: { fontSize: 16, fontWeight: '600', color: t.colors.text, marginLeft: 12 },
    excluded: { color: t.colors.muted, textDecorationLine: 'line-through' },
  });
