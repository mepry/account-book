/**
 * 검색 화면: 내역·메모·태그·날짜·카테고리로 지출(또는 수입)을 찾는다. 항목을 누르면 수정 폼, 길게 누르면 삭제 확인.
 */
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TransactionForm, type FormTarget } from '../components/TransactionForm';
import { searchTransactions, type SearchItem, type TxType } from '../db/queries';
import { useConfirmDelete } from '../hooks/useConfirmDelete';
import { useDb } from '../hooks/useDb';
import { useDataVersion } from '../lib/dataVersion';
import { log } from '../lib/logger';
import { formatWon } from '../lib/money';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';

/** 입력이 멈춘 뒤 검색까지 기다리는 시간(ms) */
const DEBOUNCE_MS = 250;

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

  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ query: string; items: SearchItem[] }>({ query: '', items: [] });
  const [form, setForm] = useState<FormTarget | null>(null);

  useEffect(() => {
    const q = query.trim();
    let alive = true;
    const timer = setTimeout(() => {
      searchTransactions(db, type, q)
        .then((items) => alive && setResult({ query: q, items }))
        .catch((e) => log.error('검색 실패', e));
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [db, type, query, version]);

  const items = result.items;
  const total = items.filter((i) => !i.excluded).reduce((s, i) => s + i.amount, 0);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: `${label} 검색` }} />
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="내역, 메모, #태그, 날짜(11/4, 2026.11), 카테고리"
        placeholderTextColor={theme.colors.subText}
        autoFocus
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {result.query ? (
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
        ListEmptyComponent={result.query ? <Text style={styles.empty}>검색 결과가 없습니다</Text> : undefined}
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
