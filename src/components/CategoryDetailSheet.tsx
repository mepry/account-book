/**
 * 통계 차트에서 카테고리 캡션·조각을 누르면 아래에서 올라오는 상세 레이어 (가운데 총 합계를 누르면 전체 내역).
 * 카테고리 합계·비율 → 소분류별 합계·비율 → 기간 내 내역 목록. 내역을 누르면 수정 폼을 연다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ALL_CATEGORIES,
  getCategoryItems,
  getCategoryTotals,
  getSubcategoryTotals,
  type CategoryItem,
  type CategoryTotal,
  type StatsFilter,
  type TxType,
} from '../db/queries';
import { useDb } from '../hooks/useDb';
import { useDataVersion } from '../lib/dataVersion';
import { log } from '../lib/logger';
import { formatNumber } from '../lib/money';
import { titleWithDetail } from '../lib/stats';
import { type Theme } from '../theme';
import { useStyles } from '../lib/theme';

export interface CategoryDetailTarget {
  /** 대분류 id (null = 미분류, ALL_CATEGORIES = 총 합계 전체) */
  id: number | null | typeof ALL_CATEGORIES;
  name: string;
  total: number;
  /** 전체 대비 퍼센트 (정수) */
  percent: number;
  color: string;
  /** 이 조각만 보기 위한 추가 필터 (결제수단별·하위카테고리별 차트의 조각) */
  extraFilter?: StatsFilter;
}

interface Props {
  target: CategoryDetailTarget | null;
  type: TxType;
  from: string;
  to: string;
  includeExcluded: boolean;
  /** 통계 화면 필터 (상세에도 같이 적용) */
  filter: StatsFilter;
  onClose: () => void;
  /** 내역 탭 → 수정 대상 id */
  onPressItem: (editId: number) => void;
  /** 내역 길게 누르기 (삭제 확인) */
  onLongPressItem: (item: CategoryItem) => void;
}

/** 소수점 없이 반올림한 퍼센트 */
const pct = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * 카테고리 상세 바텀시트.
 */
export function CategoryDetailSheet({
  target,
  type,
  from,
  to,
  includeExcluded,
  filter: screenFilter,
  onClose,
  onPressItem,
  onLongPressItem,
}: Props) {
  const styles = useStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const db = useDb();
  const version = useDataVersion();
  // 어느 카테고리 것인지 같이 들고 있어 다른 카테고리를 열 때 이전 내용이 잠깐 보이지 않게 한다
  const [data, setData] = useState<{ key: string; subs: CategoryTotal[]; items: CategoryItem[] } | null>(null);
  const filter = useMemo<StatsFilter>(() => ({ ...screenFilter, ...target?.extraFilter }), [screenFilter, target]);
  const key = target ? `${target.id}|${type}|${from}|${to}|${includeExcluded}|${JSON.stringify(filter)}` : '';

  useEffect(() => {
    if (!target) return;
    let alive = true;
    Promise.all([
      // 전체면 대분류별, 아니면 그 대분류의 소분류별 합계
      target.id === ALL_CATEGORIES
        ? getCategoryTotals(db, type, from, to, includeExcluded, filter)
        : getSubcategoryTotals(db, type, target.id, from, to, includeExcluded, filter),
      getCategoryItems(db, type, target.id, from, to, includeExcluded, filter),
    ])
      .then(([subs, items]) => alive && setData({ key, subs, items }))
      .catch((e) => log.error('카테고리 상세 조회 실패', e));
    return () => {
      alive = false;
    };
  }, [db, target, type, from, to, includeExcluded, filter, key, version]);

  const ready = data !== null && data.key === key;
  const subs = ready ? data.subs : [];
  const items = ready ? data.items : [];
  // 금액이 바뀌었을 수 있으니(수정 후) 소분류 합계로 다시 계산한다
  const total = ready ? subs.reduce((s, c) => s + c.total, 0) : (target?.total ?? 0);

  return (
    <Modal visible={target !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.handle} />
        {target ? (
          <>
            <View style={styles.header}>
              <View style={[styles.dot, { backgroundColor: target.color }]} />
              <Text style={styles.title} numberOfLines={1}>
                {target.name}
              </Text>
              <Text style={styles.headerPct}>{target.percent}%</Text>
              <Text style={styles.headerTotal}>₩{formatNumber(total)}</Text>
            </View>
            <Text style={styles.period}>
              {from} ~ {to}
            </Text>

            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              {!ready ? <Text style={styles.empty}>불러오는 중…</Text> : null}
              {ready && items.length === 0 ? <Text style={styles.empty}>이 기간에 내역이 없습니다</Text> : null}

              {subs.length > 0 ? (
                <Text style={styles.section}>{target.id === ALL_CATEGORIES ? '카테고리' : '소분류'}</Text>
              ) : null}
              {subs.map((c) => (
                <View key={`${c.id}`} style={styles.row}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.rowPct}>{pct(c.total, total)}%</Text>
                  <Text style={styles.rowAmount}>₩{formatNumber(c.total)}</Text>
                </View>
              ))}

              {items.length > 0 ? <Text style={styles.section}>내역 {items.length}건</Text> : null}
              {items.map((it) => (
                <Pressable
                  key={it.id}
                  style={[styles.row, it.excluded ? styles.excluded : null]}
                  onPress={() => onPressItem(it.edit_id)}
                  onLongPress={() => onLongPressItem(it)}
                >
                  <Text style={styles.rowDate}>{it.date.slice(5).replace('-', '/')}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={2}>
                      {titleWithDetail(it.title || '(내역 없음)', it.detail)}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {[
                        it.category,
                        it.installment_seq ? `할부 ${it.installment_seq}/${it.installment_months}` : null,
                        it.excluded ? '제외' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.rowAmount}>₩{formatNumber(it.amount)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: t.colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75%', paddingBottom: 16 },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.muted, marginTop: 8 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
    dot: { width: 12, height: 12, borderRadius: 6 },
    title: { flex: 1, fontSize: 18, fontWeight: '700', color: t.colors.text },
    headerPct: { fontSize: 15, color: t.colors.subText },
    headerTotal: { fontSize: 18, fontWeight: '700', color: t.colors.text },
    period: { fontSize: 12, color: t.colors.subText, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 },
    section: { fontSize: 14, fontWeight: '700', color: t.colors.subText, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
    empty: { textAlign: 'center', color: t.colors.subText, paddingVertical: 20 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    excluded: { opacity: 0.5 },
    rowDate: { width: 42, fontSize: 13, color: t.colors.subText },
    rowName: { flex: 1, fontSize: 15, color: t.colors.text },
    rowSub: { fontSize: 12, color: t.colors.subText, marginTop: 2 },
    rowPct: { width: 48, textAlign: 'right', fontSize: 13, color: t.colors.subText },
    rowAmount: { minWidth: 90, textAlign: 'right', fontSize: 15, color: t.colors.text },
  });
