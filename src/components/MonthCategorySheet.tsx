/**
 * 통계 월별 막대를 누르면 아래에서 올라오는 레이어: 그 달의 카테고리별 합계 (헤더로 정렬).
 * 카테고리 줄을 누르면 바로 아래에 실제 입력한 내역 목록이 펼쳐지고, 다시 누르면 접힌다.
 * 내역을 누르면 수정 폼을 연다. 통계 화면의 필터·제외 포함 설정을 그대로 따른다.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getCategoryItems,
  getCategoryTotals,
  type CategoryItem,
  type CategoryTotalCount,
  type StatsFilter,
  type TxType,
} from '../db/queries';
import { useDb } from '../hooks/useDb';
import { useDataVersion } from '../lib/dataVersion';
import { lastDayOfMonth, parseYmd, ymd } from '../lib/date';
import { log } from '../lib/logger';
import { formatNumber, formatWon } from '../lib/money';
import { titleWithDetail } from '../lib/stats';
import { type Theme } from '../theme';
import { useStyles } from '../lib/theme';
import { TitleTotalsList, type TotalsRow } from './TitleTotalsList';

interface Props {
  /** 보여줄 달 YYYY-MM (null이면 닫힘) */
  ym: string | null;
  type: TxType;
  includeExcluded: boolean;
  filter: StatsFilter;
  onClose: () => void;
  /** 내역 탭 → 수정 대상 id */
  onPressItem: (editId: number) => void;
  /** 내역 길게 누르기 (삭제 확인) */
  onLongPressItem: (item: CategoryItem) => void;
}

/** 목록 한 줄: 카테고리 합계 + 펼칠 때 쓸 카테고리 id */
type CategoryRow = TotalsRow & { id: number | null };

/**
 * YYYY-MM의 첫날·말일.
 */
function monthRange(ym: string): { from: string; to: string } {
  const { year, month } = parseYmd(`${ym}-01`);
  return { from: ymd(year, month, 1), to: ymd(year, month, lastDayOfMonth(year, month)) };
}

/**
 * 한 달 카테고리별 합계 바텀시트.
 */
export function MonthCategorySheet({ ym, type, includeExcluded, filter, onClose, onPressItem, onLongPressItem }: Props) {
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const db = useDb();
  const version = useDataVersion();
  // 어느 달 것인지 같이 들고 있어 다른 막대를 눌렀을 때 이전 달 내용이 잠깐 보이지 않게 한다
  const [data, setData] = useState<{ key: string; rows: CategoryTotalCount[] } | null>(null);
  /** 카테고리 이름 말풍선을 보는 동안 스크롤 잠금 */
  const [scrollLocked, setScrollLocked] = useState(false);
  const key = ym ? `${ym}|${type}|${includeExcluded}|${JSON.stringify(filter)}` : '';

  useEffect(() => {
    if (!ym) return;
    let alive = true;
    const { from, to } = monthRange(ym);
    getCategoryTotals(db, type, from, to, includeExcluded, filter)
      .then((rows) => alive && setData({ key, rows }))
      .catch((e) => log.error('월 카테고리 조회 실패', e));
    return () => {
      alive = false;
    };
  }, [db, ym, type, includeExcluded, filter, key, version]);

  const ready = data !== null && data.key === key;
  const rows: CategoryRow[] = ready ? data.rows.map((r) => ({ ...r, key: `${r.id}` })) : [];
  const total = rows.reduce((s, r) => s + r.total, 0);
  const count = rows.reduce((s, r) => s + r.count, 0);
  const [y, m] = (ym ?? '').split('-');

  return (
    <Modal visible={ym !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.handle} />
        {ym ? (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>
                {y}년 {parseInt(m, 10)}월 카테고리별
              </Text>
              <Text style={styles.total}>{formatWon(total)}</Text>
            </View>
            <Text style={styles.sub}>{count}건 · 카테고리를 누르면 내역이 펼쳐져요</Text>
            <ScrollView contentContainerStyle={{ paddingBottom: 12 }} scrollEnabled={!scrollLocked}>
              {ready ? (
                <TitleTotalsList
                  key={key}
                  rows={rows}
                  nameHeader="카테고리"
                  onPeekChange={setScrollLocked}
                  renderExpanded={(row) => (
                    <CategoryItems
                      type={type}
                      categoryId={row.id}
                      ym={ym}
                      includeExcluded={includeExcluded}
                      filter={filter}
                      onPressItem={onPressItem}
                      onLongPressItem={onLongPressItem}
                    />
                  )}
                />
              ) : (
                <Text style={styles.loading}>불러오는 중…</Text>
              )}
            </ScrollView>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

/**
 * 펼친 카테고리 아래에 보이는 실제 내역 목록 (최신순).
 */
function CategoryItems({
  type,
  categoryId,
  ym,
  includeExcluded,
  filter,
  onPressItem,
  onLongPressItem,
}: {
  type: TxType;
  categoryId: number | null;
  ym: string;
  includeExcluded: boolean;
  filter: StatsFilter;
  onPressItem: (editId: number) => void;
  onLongPressItem: (item: CategoryItem) => void;
}) {
  const styles = useStyles(makeStyles);
  const db = useDb();
  const version = useDataVersion();
  const [items, setItems] = useState<CategoryItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    const { from, to } = monthRange(ym);
    getCategoryItems(db, type, categoryId, from, to, includeExcluded, filter)
      .then((r) => alive && setItems(r))
      .catch((e) => log.error('카테고리 내역 조회 실패', e));
    return () => {
      alive = false;
    };
  }, [db, type, categoryId, ym, includeExcluded, filter, version]);

  if (items === null) return <Text style={styles.loading}>불러오는 중…</Text>;
  if (items.length === 0) return <Text style={styles.loading}>내역이 없습니다</Text>;
  return (
    <>
      {items.map((it) => (
        <Pressable
          key={it.id}
          style={[styles.item, it.excluded ? styles.excluded : null]}
          onPress={() => onPressItem(it.edit_id)}
          onLongPress={() => onLongPressItem(it)}
        >
          <Text style={styles.itemDate}>{it.date.slice(5).replace('-', '/')}</Text>
          <View style={{ flex: 1 }}>
            {/* 내역이 길어도 (상세)가 잘리지 않게 두 줄까지 보여준다 */}
            <Text style={styles.itemTitle} numberOfLines={2}>
              {titleWithDetail(it.title || '(내역 없음)', it.detail)}
            </Text>
            <Text style={styles.itemSub} numberOfLines={1}>
              {[
                it.category,
                it.installment_seq ? `할부 ${it.installment_seq}/${it.installment_months}` : null,
                it.excluded ? '제외' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Text style={styles.itemAmount}>₩{formatNumber(it.amount)}</Text>
        </Pressable>
      ))}
    </>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: t.colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%', paddingBottom: 16 },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.muted, marginTop: 8 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 },
    title: { fontSize: 18, fontWeight: '700', color: t.colors.text },
    total: { fontSize: 18, fontWeight: '700', color: t.colors.text },
    sub: { fontSize: 12, color: t.colors.subText, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
    loading: { textAlign: 'center', color: t.colors.subText, paddingVertical: 14 },
    // 펼친 내역은 카테고리 줄보다 안쪽으로 들여 써서 구분한다
    item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 32, paddingRight: 16, paddingVertical: 8 },
    excluded: { opacity: 0.5 },
    itemDate: { width: 40, fontSize: 12, color: t.colors.subText },
    itemTitle: { fontSize: 14, color: t.colors.text },
    itemSub: { fontSize: 11, color: t.colors.subText, marginTop: 1 },
    itemAmount: { minWidth: 80, textAlign: 'right', fontSize: 14, color: t.colors.text },
  });
