/**
 * 예산 탭: 한 달의 할부금 / 고정지출 / 예산을 위에서 아래로 보여준다.
 * - 할부금: 지출에 입력한 할부의 이번 달 분할 건 (자동 연동). 막대는 회차 진행률.
 * - 고정지출·예산: 카테고리별 계획 금액. 막대는 그 달 실제 사용액 / 계획 금액.
 * 머리 줄을 누르면 아래로 펼쳐진다. 고정지출·예산은 지난 달 설정을 가져올 수 있다.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  copyBudgetItems,
  findPreviousBudgetMonth,
  getBudgetItems,
  type BudgetItem,
  type BudgetKind,
} from '../db/budget';
import { getCategories, getDailyTotals, getMonthInstallments, type Category, type InstallmentItem } from '../db/queries';
import { useDb } from '../hooks/useDb';
import { bumpDataVersion, useDataVersion } from '../lib/dataVersion';
import { today as todayFn } from '../lib/date';
import { log } from '../lib/logger';
import { formatWon } from '../lib/money';
import { type Theme } from '../theme';
import { useStyles, useTheme } from '../lib/theme';
import { BudgetItemModal, KIND_LABELS, type BudgetEditTarget } from './BudgetItemModal';
import { TodayButton, TopBar } from './TopBar';
import { TransactionForm, type FormTarget } from './TransactionForm';

type SectionKey = 'installment' | BudgetKind;

/**
 * YYYY-MM에 개월 수를 더한다.
 */
function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map((s) => parseInt(s, 10));
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' → 'YYYY년 M월' */
const ymLabel = (ym: string): string => `${ym.slice(0, 4)}년 ${parseInt(ym.slice(5), 10)}월`;

/**
 * 가로 막대. ratio가 1을 넘으면 꽉 채우고 경고색.
 * @param ratio 채울 비율
 * @param color 채움 색 (넘치면 무시)
 */
function Bar({ ratio, color }: { ratio: number; color?: string }) {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const over = ratio > 1;
  return (
    <View style={styles.barTrack}>
      <View
        style={[
          styles.barFill,
          { width: `${Math.min(1, Math.max(0, ratio)) * 100}%`, backgroundColor: over ? theme.colors.danger : (color ?? theme.colors.primary) },
        ]}
      />
    </View>
  );
}

/**
 * 예산 탭 화면.
 */
export function BudgetScreen() {
  const theme = useTheme();
  const styles = useStyles(makeStyles);
  const db = useDb();
  const version = useDataVersion();
  const today = todayFn();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [data, setData] = useState<{ ym: string; installments: InstallmentItem[]; items: BudgetItem[]; income: number }>({
    ym,
    installments: [],
    items: [],
    income: 0,
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [prevMonths, setPrevMonths] = useState<Record<BudgetKind, string | null>>({ fixed: null, budget: null });
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ installment: false, fixed: false, budget: false });
  const [edit, setEdit] = useState<BudgetEditTarget | null>(null);
  const [form, setForm] = useState<FormTarget | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      getMonthInstallments(db, 'expense', ym, true),
      getBudgetItems(db, ym),
      getCategories(db, 'expense'),
      findPreviousBudgetMonth(db, ym, 'fixed'),
      findPreviousBudgetMonth(db, ym, 'budget'),
      // 이번 달 수입 (지출·수입 탭 기본값과 같이 통계 제외 항목은 뺀다)
      getDailyTotals(db, 'income', ym, false),
    ])
      .then(([installments, items, cats, prevFixed, prevBudget, incomeByDay]) => {
        if (!alive) return;
        const income = Object.values(incomeByDay).reduce((a, v) => a + v, 0);
        setData({ ym, installments, items, income });
        setCategories(cats);
        setPrevMonths({ fixed: prevFixed, budget: prevBudget });
      })
      .catch((e) => log.error('예산 조회 실패', e));
    return () => {
      alive = false;
    };
  }, [db, ym, version]);

  const { installments, items, income } = data;
  const fixed = items.filter((i) => i.kind === 'fixed');
  const budgets = items.filter((i) => i.kind === 'budget');
  const sum = (list: { amount: number }[]): number => list.reduce((s, i) => s + i.amount, 0);
  const spentOf = (list: BudgetItem[]): number => list.reduce((s, i) => s + i.spent, 0);
  const installmentTotal = sum(installments);
  const planTotal = installmentTotal + sum(fixed) + sum(budgets);
  const spentTotal = installmentTotal + spentOf(fixed) + spentOf(budgets);

  /** 지난 달 설정을 이 달로 가져온다. */
  const copyPrevious = (kind: BudgetKind): void => {
    const from = prevMonths[kind];
    if (!from) return;
    copyBudgetItems(db, from, ym, kind)
      .then(bumpDataVersion)
      .catch((e) => log.error('지난 달 설정 가져오기 실패', e));
  };

  const toggle = (key: SectionKey): void => setOpen((o) => ({ ...o, [key]: !o[key] }));

  /** 고정지출·예산 영역 */
  const renderPlanSection = (kind: BudgetKind, list: BudgetItem[]) => {
    const planned = sum(list);
    const spent = spentOf(list);
    const isOpen = open[kind];
    return (
      <View style={styles.section}>
        <Pressable style={styles.sectionHeader} onPress={() => toggle(kind)} accessibilityState={{ expanded: isOpen }}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>
              {KIND_LABELS[kind]} <Text style={styles.count}>{list.length}개</Text>
            </Text>
            <Text style={styles.sectionAmount}>
              {formatWon(planned)} {isOpen ? '▴' : '▾'}
            </Text>
          </View>
          {planned > 0 ? (
            <>
              <Bar ratio={spent / planned} />
              <Text style={[styles.caption, spent > planned && { color: theme.colors.danger }]}>
                사용 {formatWon(spent)} · {spent > planned ? `${formatWon(spent - planned)} 초과` : `남음 ${formatWon(planned - spent)}`}
              </Text>
            </>
          ) : null}
        </Pressable>
        {isOpen ? (
          <View>
            {list.map((item) => {
              const over = item.spent > item.amount;
              return (
                <Pressable key={item.id} style={styles.item} onPress={() => setEdit({ mode: 'edit', item })}>
                  <View style={styles.headerRow}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      › {item.category}
                    </Text>
                    <Text style={styles.itemAmount}>{formatWon(item.amount)}</Text>
                  </View>
                  <Bar ratio={item.amount > 0 ? item.spent / item.amount : 0} />
                  <Text style={[styles.caption, over && { color: theme.colors.danger }]}>
                    사용 {formatWon(item.spent)} ({item.amount > 0 ? Math.round((item.spent / item.amount) * 100) : 0}%)
                    {over ? ` · ${formatWon(item.spent - item.amount)} 초과` : ''}
                  </Text>
                </Pressable>
              );
            })}
            <View style={styles.actions}>
              <Pressable style={styles.actionButton} onPress={() => setEdit({ mode: 'add', kind })}>
                <Text style={styles.actionText}>+ {KIND_LABELS[kind]} 추가</Text>
              </Pressable>
              {prevMonths[kind] ? (
                <Pressable style={styles.actionButton} onPress={() => copyPrevious(kind)}>
                  <Text style={styles.actionText}>{ymLabel(prevMonths[kind]!)} 설정 가져오기</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="예산" titleAccessory={<TodayButton onPress={() => setYm(today.slice(0, 7))} />} />
      <ScrollView style={{ backgroundColor: theme.colors.bg }} contentContainerStyle={styles.content}>
        <View style={styles.controls}>
          <Pressable style={[styles.pill, styles.arrow]} onPress={() => setYm(shiftYm(ym, -1))} accessibilityLabel="이전 달">
            <Text style={styles.pillText}>←</Text>
          </Pressable>
          <View style={[styles.pill, { flex: 3 }]}>
            <Text style={styles.pillText}>{ymLabel(ym)}</Text>
          </View>
          <Pressable style={[styles.pill, styles.arrow]} onPress={() => setYm(shiftYm(ym, 1))} accessibilityLabel="다음 달">
            <Text style={styles.pillText}>→</Text>
          </Pressable>
        </View>

        <View style={styles.summary}>
          <View style={styles.headerRow}>
            <Text style={styles.summaryLabel}>이번 달 수입</Text>
            <Text style={[styles.summaryAmount, { color: theme.colors.income }]}>{formatWon(income)}</Text>
          </View>
          <View style={styles.headerRow}>
            <Text style={styles.summaryLabel}>이번 달 계획</Text>
            <Text style={styles.summaryAmount}>{formatWon(planTotal)}</Text>
          </View>
          {planTotal > 0 ? <Bar ratio={spentTotal / planTotal} /> : null}
          <Text style={styles.caption}>할부금 + 고정지출·예산 사용액 {formatWon(spentTotal)}</Text>
          <View style={[styles.headerRow, styles.divider]}>
            <Text style={styles.summaryLabel}>수입 − 계획</Text>
            <Text style={[styles.leftover, { color: income - planTotal < 0 ? theme.colors.expense : theme.colors.income }]}>
              {income - planTotal < 0 ? '-' : ''}
              {formatWon(Math.abs(income - planTotal))}
            </Text>
          </View>
        </View>

        {/* 할부금 (지출에 입력한 할부 자동 연동) */}
        <View style={styles.section}>
          <Pressable style={styles.sectionHeader} onPress={() => toggle('installment')} accessibilityState={{ expanded: open.installment }}>
            <View style={styles.headerRow}>
              <Text style={styles.sectionTitle}>
                할부금 <Text style={styles.count}>{installments.length}건</Text>
              </Text>
              <Text style={styles.sectionAmount}>
                {formatWon(installmentTotal)} {open.installment ? '▴' : '▾'}
              </Text>
            </View>
          </Pressable>
          {open.installment ? (
            installments.length ? (
              installments.map((i) => (
                <Pressable key={i.id} style={styles.item} onPress={() => setForm({ mode: 'edit', id: i.edit_id })}>
                  <View style={styles.headerRow}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      › {i.title || '(내역 없음)'}
                    </Text>
                    <Text style={styles.itemAmount}>{formatWon(i.amount)}</Text>
                  </View>
                  <Bar ratio={i.installment_seq / i.installment_months} color={theme.colors.saturday} />
                  <Text style={styles.caption}>
                    {i.installment_seq}/{i.installment_months}회차 · 남은 {formatWon(i.remaining_amount)} · 총 {formatWon(i.total)}
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.empty}>이번 달 할부금이 없습니다. 지출 입력에서 할부를 고르면 여기에 나와요.</Text>
            )
          ) : null}
        </View>

        {renderPlanSection('fixed', fixed)}
        {renderPlanSection('budget', budgets)}
      </ScrollView>

      <BudgetItemModal
        target={edit}
        ym={ym}
        categories={categories}
        usedCategoryIds={items.map((i) => i.category_id)}
        onClose={() => setEdit(null)}
      />
      <TransactionForm type="expense" target={form} onClose={() => setForm(null)} />
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.colors.header },
    content: { paddingBottom: 24 },
    controls: { flexDirection: 'row', gap: 6, padding: 6, paddingTop: 14 },
    pill: { flex: 1, backgroundColor: t.colors.surface, borderRadius: t.radius, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
    arrow: { flex: 1 },
    pillText: { fontSize: 17, color: t.colors.text },
    summary: { marginHorizontal: 6, marginTop: 6, padding: 14, borderRadius: t.radius, borderWidth: 1, borderColor: t.colors.border, gap: 6 },
    summaryLabel: { fontSize: 15, color: t.colors.subText },
    summaryAmount: { fontSize: 20, fontWeight: '700', color: t.colors.text },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, paddingTop: 8, marginTop: 2 },
    leftover: { fontSize: 17, fontWeight: '700' },
    section: { marginHorizontal: 6, marginTop: 10, backgroundColor: t.colors.surface, borderRadius: t.radius, overflow: 'hidden' },
    sectionHeader: { paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: t.colors.text },
    count: { fontSize: 13, fontWeight: '400', color: t.colors.subText },
    sectionAmount: { fontSize: 16, fontWeight: '700', color: t.colors.expense },
    item: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      gap: 5,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.bg,
    },
    itemTitle: { flex: 1, fontSize: 15, color: t.colors.text },
    itemAmount: { fontSize: 15, fontWeight: '600', color: t.colors.text },
    caption: { fontSize: 12, color: t.colors.subText },
    barTrack: { height: 8, borderRadius: 4, backgroundColor: t.colors.border, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: 4 },
    empty: { padding: 14, fontSize: 13, color: t.colors.subText, backgroundColor: t.colors.bg },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.bg,
    },
    actionButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: t.radius, borderWidth: 1, borderColor: t.colors.border },
    actionText: { fontSize: 14, color: t.colors.text },
  });
